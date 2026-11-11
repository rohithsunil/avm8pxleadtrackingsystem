import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { one, query } from './db.js';
import { HttpError } from './http.js';

const COOKIE = 'avm_session';
const SESSION_DAYS = 30;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters');
  return s;
}

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function readCookie(req, name) {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function cookieAttrs(req) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function sessionCookie(req, role) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = `${role}.${exp}`;
  return `${COOKIE}=${payload}.${sign(payload)}; Max-Age=${SESSION_DAYS * 86400}; ${cookieAttrs(req)}`;
}

export function clearCookie(req) {
  return `${COOKIE}=; Max-Age=0; ${cookieAttrs(req)}`;
}

// Returns 'staff', 'agency' or null.
export function getRole(req) {
  const value = readCookie(req, COOKIE);
  if (!value) return null;
  const [role, exp, sig] = value.split('.');
  if (!role || !exp || !sig) return null;
  if (!safeEqual(sig, sign(`${role}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return role === 'staff' || role === 'agency' ? role : null;
}

export function requireRole(req, ...allowed) {
  const role = getRole(req);
  if (!role) throw new HttpError(401, 'Please enter your PIN');
  if (!allowed.includes(role)) throw new HttpError(403, 'This page is for the agency only');
  return role;
}

// The lockout is keyed by a hash of the caller's IP, which is the closest
// stateless stand-in for "this device".
function clientKey(req) {
  const ip =
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'local';
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

export async function login(req, pin) {
  const staffPin = process.env.STAFF_PIN;
  const agencyPin = process.env.AGENCY_PIN;
  if (!staffPin || !agencyPin) throw new Error('STAFF_PIN and AGENCY_PIN must be set');
  if (staffPin === agencyPin) throw new Error('STAFF_PIN and AGENCY_PIN must be different');

  const key = clientKey(req);
  const attempt = await one(
    'SELECT failures, locked_until FROM login_attempts WHERE client_key = $1',
    [key],
  );
  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(attempt.locked_until) - new Date()) / 60000);
    throw new HttpError(429, `Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }

  const entered = String(pin ?? '').trim();
  const role = safeEqual(entered, agencyPin) ? 'agency' : safeEqual(entered, staffPin) ? 'staff' : null;

  if (role) {
    await query('DELETE FROM login_attempts WHERE client_key = $1', [key]);
    return role;
  }

  const row = await one(
    `INSERT INTO login_attempts (client_key, failures) VALUES ($1, 1)
     ON CONFLICT (client_key) DO UPDATE
       SET failures = CASE WHEN login_attempts.locked_until IS NOT NULL THEN 1
                           ELSE login_attempts.failures + 1 END,
           locked_until = NULL
     RETURNING failures`,
    [key],
  );
  if (row.failures >= MAX_FAILURES) {
    await query(
      `UPDATE login_attempts SET locked_until = now() + make_interval(mins => $2), failures = 0
       WHERE client_key = $1`,
      [key, LOCK_MINUTES],
    );
    throw new HttpError(429, `Too many wrong tries. Try again in ${LOCK_MINUTES} minutes.`);
  }
  const left = MAX_FAILURES - row.failures;
  throw new HttpError(401, `Wrong PIN. ${left} tr${left === 1 ? 'y' : 'ies'} left.`);
}
