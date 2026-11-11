import { z } from 'zod';
import { query, one } from './db.js';
import { HttpError, parseOrThrow } from './http.js';
import { CHANNELS, LOST_REASONS, SOURCES, STATUSES, isValidPhone, normalizePhone } from '../shared/constants.js';

const LEAD_COLUMNS = `
  l.id, l.created_at, l.updated_at, l.customer_name, l.business_name, l.phone, l.service,
  l.channel, l.source, l.campaign_id, c.name AS campaign_name, l.status, l.amount, l.lost_reason,
  l.handled_by, l.note, l.duplicate, l.quoted_at, l.closed_at`;

const baseSchema = z.object({
  customer_name: z.string().trim().min(1, 'Enter the customer name').max(100),
  business_name: z.string().trim().max(120).default(''),
  phone: z
    .string()
    .transform(normalizePhone)
    .refine(isValidPhone, 'Enter a valid phone number'),
  service: z.string().trim().min(1, 'Enter the service').max(60),
  channel: z.enum(CHANNELS, { message: 'Pick the channel' }).default('WhatsApp'),
  source: z.enum(SOURCES).default('Ad'),
  campaign_id: z.number().int().positive().nullable().default(null),
  status: z.enum(STATUSES).default('New'),
  amount: z.number().nonnegative().max(1e9).nullable().default(null),
  lost_reason: z.enum(LOST_REASONS).nullable().default(null),
  handled_by: z.string().trim().min(1, 'Pick who handled it').max(60),
  note: z.string().trim().max(200).default(''),
});

// Rules that depend on more than one field.
async function checkRules(lead) {
  const fields = {};
  if (lead.status === 'Won' && !(lead.amount > 0)) fields.amount = 'Enter the ticket value for a won lead';
  if (lead.status === 'Lost' && !lead.lost_reason) fields.lost_reason = 'Pick why it was lost';
  if (lead.campaign_id) {
    const exists = await one('SELECT 1 FROM campaigns WHERE id = $1', [lead.campaign_id]);
    if (!exists) fields.campaign_id = 'Unknown campaign';
  }
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted fields', fields);
}

// Only keep lost reason / campaign when they apply. The ticket value (amount)
// is kept at every stage: the quoted price, then the order value once won.
function tidy(lead) {
  return {
    ...lead,
    amount: lead.amount > 0 ? lead.amount : null,
    lost_reason: lead.status === 'Lost' ? lead.lost_reason : null,
    campaign_id: lead.source === 'Ad' ? lead.campaign_id : null,
  };
}

export async function getLead(id) {
  const lead = await one(
    `SELECT ${LEAD_COLUMNS} FROM leads l LEFT JOIN campaigns c ON c.id = l.campaign_id WHERE l.id = $1`,
    [id],
  );
  if (!lead) throw new HttpError(404, 'Lead not found');
  return lead;
}

export async function listLeads(params) {
  const where = [];
  const values = [];
  const q = (params.get('q') ?? '').trim();
  if (q) {
    values.push(`%${q}%`);
    const digits = q.replace(/\D/g, '');
    const phoneClause = digits.length >= 3 ? ` OR l.phone LIKE $${values.push(`%${digits}%`)}` : '';
    where.push(`(l.customer_name ILIKE $1 OR l.business_name ILIKE $1${phoneClause})`);
  }
  const status = params.get('status');
  if (status && STATUSES.includes(status)) where.push(`l.status = $${values.push(status)}`);
  if (params.get('followup') === '1') {
    where.push(`l.status = 'New' AND NOT l.duplicate`);
    where.push(`l.created_at < now() - make_interval(days => $${values.push(Number(params.get('days') ?? 2))})`);
  }

  const limit = Math.min(Number(params.get('limit')) || 50, 200);
  const offset = Math.max(Number(params.get('offset')) || 0, 0);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, totals] = await Promise.all([
    query(
      `SELECT ${LEAD_COLUMNS} FROM leads l LEFT JOIN campaigns c ON c.id = l.campaign_id
       ${whereSql}
       ORDER BY l.created_at DESC LIMIT ${limit + 1} OFFSET ${offset}`,
      values,
    ),
    // Totals for everything matching the search/filter, not just this page.
    one(
      `SELECT count(*) FILTER (WHERE NOT l.duplicate) AS leads,
              count(*) FILTER (WHERE NOT l.duplicate AND l.status = 'Won') AS won,
              COALESCE(sum(l.amount) FILTER (WHERE NOT l.duplicate AND l.status = 'Won'), 0) AS won_value,
              COALESCE(sum(l.amount) FILTER (WHERE NOT l.duplicate AND l.status IN ('New', 'Quoted')), 0) AS open_value
       FROM leads l ${whereSql}`,
      values,
    ),
  ]);
  return { leads: rows.slice(0, limit), hasMore: rows.length > limit, totals };
}

export async function findByPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!isValidPhone(phone)) return { matches: [] };
  const matches = await query(
    `SELECT ${LEAD_COLUMNS} FROM leads l LEFT JOIN campaigns c ON c.id = l.campaign_id
     WHERE l.phone = $1 AND NOT l.duplicate ORDER BY l.created_at DESC LIMIT 3`,
    [phone],
  );
  return { matches };
}

export async function createLead(body) {
  const lead = tidy(parseOrThrow(baseSchema, body));
  await checkRules(lead);
  const quoted = lead.status === 'Quoted' || lead.status === 'Won';
  const closed = lead.status === 'Won' || lead.status === 'Lost';
  const row = await one(
    `INSERT INTO leads (customer_name, business_name, phone, service, source, campaign_id, status,
                        amount, lost_reason, handled_by, note, quoted_at, closed_at, channel)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             CASE WHEN $12 THEN now() END, CASE WHEN $13 THEN now() END, $14)
     RETURNING id`,
    [
      lead.customer_name, lead.business_name, lead.phone, lead.service, lead.source, lead.campaign_id,
      lead.status, lead.amount, lead.lost_reason, lead.handled_by, lead.note, quoted, closed, lead.channel,
    ],
  );
  return getLead(row.id);
}

export async function updateLead(id, body) {
  const current = await getLead(id);
  const patch = parseOrThrow(baseSchema.partial().extend({ duplicate: z.boolean().optional() }), body);
  // Fields left out of the patch keep their current values.
  const merged = Object.fromEntries(
    Object.keys(baseSchema.shape).map((k) => [k, k in body ? patch[k] : current[k]]),
  );
  const lead = tidy(merged);
  await checkRules(lead);
  const duplicate = patch.duplicate ?? current.duplicate;

  await query(
    `UPDATE leads SET
       customer_name = $2, business_name = $3, phone = $4, service = $5, source = $6, campaign_id = $7,
       status = $8, amount = $9, lost_reason = $10, handled_by = $11, note = $12, duplicate = $13,
       channel = $14,
       updated_at = now(),
       quoted_at = CASE WHEN $8 IN ('Quoted', 'Won') THEN COALESCE(quoted_at, now())
                        WHEN $8 = 'New' THEN NULL ELSE quoted_at END,
       closed_at = CASE WHEN $8 IN ('Won', 'Lost') THEN
                          CASE WHEN status = $8 THEN closed_at ELSE now() END
                        ELSE NULL END
     WHERE id = $1`,
    [
      id, lead.customer_name, lead.business_name, lead.phone, lead.service, lead.source, lead.campaign_id,
      lead.status, lead.amount, lead.lost_reason, lead.handled_by, lead.note, duplicate, lead.channel,
    ],
  );
  return getLead(id);
}
