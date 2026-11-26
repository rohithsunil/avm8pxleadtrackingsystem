// Meta Ads Manager reports: upload the Campaigns CSV export and keep its
// figures exactly, one row per campaign per reporting period.
import { z } from 'zod';
import { query, transaction } from './db.js';
import { HttpError, parseOrThrow } from './http.js';

// Small RFC 4180 CSV parser: quoted fields, doubled quotes, CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Meta's result indicator says what a "result" is for this campaign.
function resultKind(indicator) {
  const s = indicator.toLowerCase();
  if (s.includes('messaging')) return 'chat';
  if (s.includes('lead')) return 'lead_form';
  return 'other';
}
const KIND_LABEL = { chat: 'WhatsApp chats', lead_form: 'Lead forms', other: 'Results' };

const REQUIRED = ['Reporting starts', 'Reporting ends', 'Campaign name', 'Results', 'Result indicator', 'Amount spent (AED)', 'Impressions'];

export async function importCsv(body) {
  const { csv } = parseOrThrow(z.object({ csv: z.string().min(10, 'The file is empty').max(500_000, 'The file is too large') }), body);
  const rows = parseCsv(csv.replace(/^﻿/, ''));
  const header = rows.shift()?.map((h) => h.trim()) ?? [];
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new HttpError(400, `This doesn't look like a Meta Campaigns export. Missing columns: ${missing.join(', ')}. Spend must be in AED.`);
  }
  const col = (r, name) => (header.includes(name) ? (r[header.indexOf(name)] ?? '').trim() : '');

  const reports = [];
  const skipped = [];
  for (const r of rows) {
    const name = col(r, 'Campaign name');
    const start = col(r, 'Reporting starts');
    const end = col(r, 'Reporting ends');
    const spend = num(col(r, 'Amount spent (AED)')) ?? 0;
    const impressions = Math.round(num(col(r, 'Impressions')) ?? 0);
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    if (!spend && !impressions) { skipped.push(name); continue; } // drafts and campaigns with no delivery
    const indicator = col(r, 'Result indicator');
    const kind = resultKind(indicator);
    const budgetType = col(r, 'Ad set budget type').toLowerCase();
    reports.push({
      name, start, end, spend, impressions,
      reach: header.includes('Reach') ? Math.round(num(col(r, 'Reach')) ?? 0) : null,
      results: Math.round(num(col(r, 'Results')) ?? 0),
      kind, label: KIND_LABEL[kind],
      dailyBudget: budgetType === 'daily' ? num(col(r, 'Ad set budget')) : null,
      delivery: col(r, 'Campaign delivery'),
    });
  }
  if (!reports.length) throw new HttpError(400, 'No campaigns with spend or impressions in this file.');

  let replaced = 0;
  await transaction(async (q) => {
    for (const rep of reports) {
      const [c] = await q(
        `INSERT INTO campaigns (name, prefilled_message, active) VALUES ($1, '', $2)
         ON CONFLICT (name) DO UPDATE SET active = CASE WHEN $3 THEN EXCLUDED.active ELSE campaigns.active END
         RETURNING id`,
        [rep.name, rep.delivery === '' ? true : rep.delivery === 'active', rep.delivery !== ''],
      );
      // A new export for a period replaces any earlier report it overlaps,
      // so the same days are never counted twice.
      const gone = await q(
        `DELETE FROM ad_reports WHERE campaign_id = $1 AND period_start <= $3 AND period_end >= $2 RETURNING id`,
        [c.id, rep.start, rep.end],
      );
      replaced += gone.length;
      await q(
        `INSERT INTO ad_reports (campaign_id, period_start, period_end, spend, impressions, reach, results,
                                 result_kind, result_label, daily_budget, delivery)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [c.id, rep.start, rep.end, rep.spend, rep.impressions, rep.reach, rep.results, rep.kind, rep.label, rep.dailyBudget, rep.delivery],
      );
    }
  });
  return { imported: reports.length, replaced, skipped, ...(await listReports()) };
}

export async function listReports() {
  const reports = await query(
    `SELECT r.id, c.name AS campaign, r.period_start, r.period_end, r.spend, r.impressions, r.reach, r.results,
            r.result_kind, r.result_label, r.daily_budget, r.delivery, r.imported_at
     FROM ad_reports r JOIN campaigns c ON c.id = r.campaign_id
     ORDER BY r.period_end DESC, r.spend DESC`,
  );
  return { reports };
}

export async function deleteReport(id) {
  await query('DELETE FROM ad_reports WHERE id = $1', [id]);
  return listReports();
}
