import { z } from 'zod';
import { query, one } from './db.js';
import { HttpError, parseOrThrow } from './http.js';
import { CHANNELS, DEFAULT_THRESHOLDS, LOST_REASONS, STATUSES } from '../shared/constants.js';

export async function getSettings() {
  const rows = await query('SELECT key, value FROM settings');
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    services: map.services ?? [],
    staff: map.staff ?? [],
    thresholds: { ...DEFAULT_THRESHOLDS, ...(map.thresholds ?? {}) },
  };
}

// Everything the lead form and leads list need, for both roles.
export async function getOptions(role) {
  const settings = await getSettings();
  const campaigns = await query(
    `SELECT id, name, prefilled_message, active FROM campaigns
     ${role === 'agency' ? '' : 'WHERE active'}
     ORDER BY active DESC, created_at DESC`,
  );
  return {
    role,
    services: settings.services,
    staff: settings.staff,
    statuses: STATUSES,
    lostReasons: LOST_REASONS,
    channels: CHANNELS,
    campaigns,
    followupDays: settings.thresholds.followup_days,
    ...(role === 'agency' ? { thresholds: settings.thresholds } : {}),
  };
}

const nameList = z
  .array(z.string().trim().min(1).max(60))
  .max(100)
  .transform((list) => [...new Set(list)]);

const ratio = z.number().min(0).max(1);
const settingsSchema = z.object({
  services: nameList.optional(),
  staff: nameList.optional(),
  thresholds: z
    .object({
      logging_min: ratio,
      junk_max: ratio,
      followup_max: ratio,
      followup_days: z.number().int().min(1).max(30),
      win_rate_min: ratio,
      cpl_rise_max: z.number().min(0).max(10),
      min_leads: z.number().int().min(0).max(1000),
    })
    .optional(),
});

export async function updateSettings(body) {
  const data = parseOrThrow(settingsSchema, body);
  for (const [key, value] of Object.entries(data)) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)],
    );
  }
  return getSettings();
}

const campaignSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  prefilled_message: z.string().trim().max(300).default(''),
  active: z.boolean().default(true),
});

export async function createCampaign(body) {
  const data = parseOrThrow(campaignSchema, body);
  try {
    return await one(
      `INSERT INTO campaigns (name, prefilled_message, active) VALUES ($1, $2, $3)
       RETURNING id, name, prefilled_message, active`,
      [data.name, data.prefilled_message, data.active],
    );
  } catch (err) {
    if (err.code === '23505') throw new HttpError(400, 'A campaign with this name already exists', { name: 'Name already used' });
    throw err;
  }
}

export async function updateCampaign(id, body) {
  const data = parseOrThrow(campaignSchema.partial(), body);
  const current = await one('SELECT * FROM campaigns WHERE id = $1', [id]);
  if (!current) throw new HttpError(404, 'Campaign not found');
  const next = { ...current, ...data };
  try {
    return await one(
      `UPDATE campaigns SET name = $2, prefilled_message = $3, active = $4 WHERE id = $1
       RETURNING id, name, prefilled_message, active`,
      [id, next.name, next.prefilled_message, next.active],
    );
  } catch (err) {
    if (err.code === '23505') throw new HttpError(400, 'A campaign with this name already exists', { name: 'Name already used' });
    throw err;
  }
}
