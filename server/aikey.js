// The Claude API key, pasted by the agency in Settings.
// - Stored encrypted (AES-256-GCM) in the settings table, with a key derived
//   from SESSION_SECRET, so a database dump alone doesn't reveal it.
// - Never sent back to the browser: the page only learns whether a key is set
//   and its last four characters.
// - ANTHROPIC_API_KEY in the environment still works as a fallback.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { one, query } from './db.js';
import { HttpError, parseOrThrow } from './http.js';

const SETTING = 'anthropic_api_key';

function cipherKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET must be set');
  return createHash('sha256').update(`avm-leads:anthropic-key:${secret}`).digest();
}

function encrypt(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cipherKey(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function decrypt({ iv, tag, data }) {
  const decipher = createDecipheriv('aes-256-gcm', cipherKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// Cached briefly per function instance, so each AI call doesn't hit the database.
let cache = { at: 0, value: undefined };
const CACHE_MS = 60_000;

async function storedKey() {
  const row = await one('SELECT value FROM settings WHERE key = $1', [SETTING]);
  if (!row) return null;
  try {
    return { key: decrypt(row.value), last4: row.value.last4, savedAt: row.value.saved_at };
  } catch {
    // SESSION_SECRET changed since it was saved: treat it as not set.
    return { key: null, unreadable: true };
  }
}

/** The key to use for Claude calls, or null. */
export async function getApiKey() {
  if (Date.now() - cache.at < CACHE_MS && cache.value !== undefined) return cache.value;
  const stored = await storedKey();
  const value = stored?.key || process.env.ANTHROPIC_API_KEY || null;
  cache = { at: Date.now(), value };
  return value;
}

/** What the Settings page may know: never the key itself. */
export async function keyStatus() {
  const stored = await storedKey();
  if (stored?.key) return { configured: true, source: 'settings', last4: stored.last4, savedAt: stored.savedAt };
  if (process.env.ANTHROPIC_API_KEY) {
    return { configured: true, source: 'environment', last4: process.env.ANTHROPIC_API_KEY.slice(-4), unreadable: !!stored?.unreadable };
  }
  return { configured: false, unreadable: !!stored?.unreadable };
}

const keySchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^sk-ant-[A-Za-z0-9_-]{20,}$/, 'That doesn’t look like a Claude API key. It starts with sk-ant-'),
});

export async function saveKey(body) {
  const { key } = parseOrThrow(keySchema, body);

  // Check it works before saving: listing models is free.
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 10_000 }).models.list({ limit: 1 });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new HttpError(400, 'Claude rejected this key. Check it in the Claude Console.', { key: 'Claude rejected this key' });
    }
    if (err instanceof Anthropic.APIError) {
      throw new HttpError(502, 'Could not reach Claude to check the key. Try again in a minute.');
    }
    throw err;
  }

  const value = { ...encrypt(key), last4: key.slice(-4), saved_at: new Date().toISOString() };
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [SETTING, JSON.stringify(value)],
  );
  cache = { at: 0, value: undefined };
  return keyStatus();
}

export async function removeKey() {
  await query('DELETE FROM settings WHERE key = $1', [SETTING]);
  cache = { at: 0, value: undefined };
  return keyStatus();
}
