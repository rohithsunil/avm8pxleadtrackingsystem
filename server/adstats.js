import { z } from 'zod';
import { query, transaction } from './db.js';
import { HttpError, isoDate, parseOrThrow } from './http.js';
import { mondayOf } from './dashboard.js';

// One row per campaign for the week: saved numbers where they exist, zeros otherwise.
export async function getWeek(params) {
  const week = params.get('week');
  if (!isoDate.test(week ?? '')) throw new HttpError(400, 'Pick a week');
  const weekStart = mondayOf(week);
  const rows = await query(
    `SELECT c.id AS campaign_id, c.name, c.active, (a.id IS NOT NULL) AS saved,
            COALESCE(a.spend, 0) AS spend, COALESCE(a.impressions, 0) AS impressions,
            COALESCE(a.clicks, 0) AS clicks, COALESCE(a.conversations, 0) AS conversations
     FROM campaigns c
     LEFT JOIN ad_stats a ON a.campaign_id = c.id AND a.week_start = $1
     WHERE c.active OR a.id IS NOT NULL
     ORDER BY c.active DESC, c.name`,
    [weekStart],
  );
  return { weekStart, exists: rows.some((r) => r.saved), rows };
}

const count = z.number().int().min(0).max(1e9);
const weekSchema = z.object({
  week_start: z.string().regex(isoDate, 'Pick a week'),
  rows: z
    .array(
      z.object({
        campaign_id: z.number().int().positive(),
        spend: z.number().min(0).max(1e9),
        impressions: count,
        clicks: count,
        conversations: count,
      }),
    )
    .min(1, 'Add a campaign in Settings first'),
});

export async function saveWeek(body) {
  const data = parseOrThrow(weekSchema, body);
  const weekStart = mondayOf(data.week_start);
  await transaction(async (q) => {
    for (const r of data.rows) {
      await q(
        `INSERT INTO ad_stats (campaign_id, week_start, spend, impressions, clicks, conversations)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (campaign_id, week_start) DO UPDATE SET
           spend = EXCLUDED.spend, impressions = EXCLUDED.impressions,
           clicks = EXCLUDED.clicks, conversations = EXCLUDED.conversations`,
        [r.campaign_id, weekStart, r.spend, r.impressions, r.clicks, r.conversations],
      );
    }
  });
  return getWeek(new URLSearchParams({ week: weekStart }));
}
