import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { one } from './db.js';
import { HttpError, isoDate, parseOrThrow } from './http.js';
import { getOptions } from './settings.js';
import { getApiKey } from './aikey.js';
import { periodReport, addDays, mondayOf } from './dashboard.js';
import { CHANNELS, LOST_REASONS, STATUSES, isValidPhone, normalizePhone } from '../shared/constants.js';

// Claude Haiku 5.5: fast and cheap, which suits filling a form while someone waits.
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';

// The key comes from Settings (encrypted in the database) or ANTHROPIC_API_KEY.
let client;
let clientKey;
async function claude() {
  const apiKey = await getApiKey();
  if (!apiKey) throw new HttpError(503, 'The AI features are not set up yet. Add a Claude API key in Settings.');
  if (!client || clientKey !== apiKey) {
    // No automatic retries: staff are waiting, and the form works without AI.
    client = new Anthropic({ apiKey, maxRetries: 0 });
    clientKey = apiKey;
  }
  return client;
}

function aiError(err) {
  if (err instanceof HttpError) return err;
  if (err instanceof Anthropic.RateLimitError) return new HttpError(503, 'The AI is busy. Try again in a minute.');
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new HttpError(504, 'The AI took too long. Fill the form by hand.');
  if (err instanceof Anthropic.APIError) {
    console.error('Claude API error', err.status, err.message);
    return new HttpError(502, 'The AI could not answer. Fill the form by hand.');
  }
  return err;
}

// ---------- Paste to log ----------

const ParsedLead = z.object({
  customer_name: z.string().nullable(),
  business_name: z.string().nullable(),
  phone: z.string().nullable(),
  service: z.string().nullable(),
  channel: z.enum(CHANNELS).nullable(),
  campaign_id: z.number().int().nullable(),
  status: z.enum(STATUSES).nullable(),
  amount: z.number().nullable(),
  lost_reason: z.enum(LOST_REASONS).nullable(),
  note: z.string().nullable(),
});

const PARSE_SYSTEM = `You fill in a lead form for AVM for Printing, a print shop in the UAE, from a WhatsApp message or a staff member's quick note. The text may be in English, Arabic or a mix.

Return only what the text states. Use null for anything it does not state; never guess a name, number or amount.
- customer_name: the person's name, written as it appears.
- business_name: the customer's business, if one is named.
- phone: the number as written, including any country code, if a phone number appears.
- service: must be exactly one of the services listed, picking the closest match; null if none fits.
- channel: how the customer reached AVM. "Phone call" if they called; "Instagram" for Instagram or IG DMs; "Facebook" for Facebook or Messenger; "WhatsApp" for WhatsApp or a pasted WhatsApp chat. null if unclear.
- campaign_id: the id of the campaign whose pre-filled message appears in the text; null otherwise.
- status: "Won" if the note says they paid, ordered or confirmed; "Quoted" if a price was sent; "Lost" if they declined; otherwise null.
- amount: the amount in UAE dirhams (AED, dhs, dirham) for a won order as a plain number ("2.5k" is 2500); null if not won or not stated.
- lost_reason: only when status is Lost, one of the listed reasons.
- note: a short useful detail not captured elsewhere (quantity, deadline), under 15 words; null if nothing.`;

export async function parseLead(body, role) {
  const { text } = parseOrThrow(z.object({ text: z.string().trim().min(3, 'Paste a message first').max(2000) }), body);
  const options = await getOptions(role);
  const campaigns = options.campaigns.filter((c) => c.active);

  const context = [
    `Services: ${options.services.join(' | ') || '(none set)'}`,
    `Lost reasons: ${LOST_REASONS.join(' | ')}`,
    `Campaigns (id: pre-filled message):\n${campaigns.map((c) => `${c.id}: ${c.prefilled_message || c.name}`).join('\n') || '(none)'}`,
  ].join('\n\n');

  let response;
  try {
    response = await (await claude()).messages.parse(
      {
        model: MODEL,
        max_tokens: 1024,
        system: PARSE_SYSTEM,
        output_config: { effort: 'low', format: zodOutputFormat(ParsedLead) },
        messages: [{ role: 'user', content: `${context}\n\n<text>\n${text}\n</text>` }],
      },
      { timeout: 7000 },
    );
  } catch (err) {
    throw aiError(err);
  }
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new HttpError(422, 'Could not read that message. Fill the form by hand.');
  }

  // Keep only values the form can use.
  const p = response.parsed_output;
  const service = options.services.find((s) => s.toLowerCase() === p.service?.toLowerCase()) ?? null;
  const campaign = campaigns.find((c) => c.id === p.campaign_id) ?? null;
  const phone = p.phone ? normalizePhone(p.phone) : null;
  const fields = {
    customer_name: p.customer_name?.trim() || null,
    business_name: p.business_name?.trim() || null,
    phone: phone && isValidPhone(phone) ? phone : null,
    service,
    channel: p.channel,
    source: campaign ? 'Ad' : null,
    campaign_id: campaign?.id ?? null,
    status: p.status,
    amount: p.status === 'Won' && p.amount > 0 ? p.amount : null,
    lost_reason: p.status === 'Lost' ? p.lost_reason : null,
    note: p.note?.trim() || null,
  };
  return { fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)) };
}

// ---------- Weekly summary ----------

const SUMMARY_SYSTEM = `You write a short weekly note from a marketing agency to its client AVM for Printing, a print shop in the UAE that gets customer enquiries on WhatsApp from the agency's ads.

Write five or six plain sentences, as one paragraph, no headings, bullets or greeting:
1. What happened this week: spend, leads, sales and revenue, compared with the four weeks before.
2. The main weak point, with its number. The "diagnosis" field is the dashboard's own finding; lead with it unless the numbers clearly say otherwise.
3. One concrete action for next week.

Rules:
- Use only the numbers given. Never invent or estimate a figure.
- Money in UAE dirhams written as AED with comma grouping (AED 125,000).
- Factual and neutral. Never blame or name a person.
- If the diagnosis check is "logging", say the data is incomplete because leads are not being logged, ask for every WhatsApp enquiry to be logged, and draw no other conclusions.
- If there is very little data, say so plainly.`;

function compact(report) {
  return {
    period: report.range,
    numbers: report.headline,
    funnel: report.funnel,
    diagnosis: { check: report.diagnosis.check, finding: report.diagnosis.text },
    lost_reasons: report.lostReasons,
  };
}

export async function getSummary(params) {
  const week = params.get('week');
  if (!isoDate.test(week ?? '')) throw new HttpError(400, 'Pick a week');
  const row = await one('SELECT week_start, body, created_at FROM summaries WHERE week_start = $1', [mondayOf(week)]);
  return { summary: row };
}

export async function writeSummary(body) {
  const { week_start } = parseOrThrow(z.object({ week_start: z.string().regex(isoDate) }), body);
  const weekStart = mondayOf(week_start);
  const weekEnd = addDays(weekStart, 6);

  // Totals only: no customer names or phone numbers leave the database.
  const [thisWeek, before] = await Promise.all([
    periodReport(weekStart, weekEnd, false),
    periodReport(addDays(weekStart, -28), addDays(weekStart, -1), false),
  ]);
  const input = { this_week: compact(thisWeek), previous_four_weeks: compact(before) };

  let response;
  try {
    response = await (await claude()).messages.create(
      {
        model: MODEL,
        max_tokens: 2048,
        system: SUMMARY_SYSTEM,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: JSON.stringify(input, null, 1) }],
      },
      { timeout: 30000 },
    );
  } catch (err) {
    throw aiError(err);
  }
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'The AI declined to write this summary.');
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new HttpError(502, 'The AI returned an empty summary. Try again.');
  return saveSummary(weekStart, text);
}

export async function editSummary(body) {
  const data = parseOrThrow(
    z.object({ week_start: z.string().regex(isoDate), body: z.string().trim().min(1).max(4000) }),
    body,
  );
  return saveSummary(mondayOf(data.week_start), data.body);
}

async function saveSummary(weekStart, text) {
  const row = await one(
    `INSERT INTO summaries (week_start, body) VALUES ($1, $2)
     ON CONFLICT (week_start) DO UPDATE SET body = EXCLUDED.body, created_at = now()
     RETURNING week_start, body, created_at`,
    [weekStart, text],
  );
  return { summary: row };
}
