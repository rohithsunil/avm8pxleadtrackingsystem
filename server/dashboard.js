import { query, one } from './db.js';
import { HttpError, isoDate } from './http.js';
import { getSettings } from './settings.js';
import { REASON_JUNK, REASON_PRICE, TIME_ZONE } from '../shared/constants.js';

// All dates are UAE calendar dates as 'YYYY-MM-DD'. Leads are bucketed by the
// UAE date they were logged. Ad numbers come from Meta reports (one per
// campaign per reporting period); a range that covers part of a report takes
// that share of its days, so totals are exact when the range matches Meta's.
const LOCAL_DATE = `(l.created_at AT TIME ZONE '${TIME_ZONE}')::date`;

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -offset);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
}

const ratio = (a, b) => (b > 0 ? a / b : null);

// One customer = one business name, ignoring case and spacing.
const NAME_KEY = `lower(regexp_replace(trim(l.customer_name), '\\s+', ' ', 'g'))`;

// Each Meta report that overlaps [$1, $2], with f = the share of its days inside.
const REPORTS_IN_RANGE = `
  SELECT ar.*, (LEAST(ar.period_end, $2::date) - GREATEST(ar.period_start, $1::date) + 1)::numeric
               / (ar.period_end - ar.period_start + 1) AS f
  FROM ad_reports ar WHERE ar.period_start <= $2::date AND ar.period_end >= $1::date`;

// Lead filter shared by every query: in range, not a duplicate, ad-only unless `all`.
function leadFilter(from, to, all, start = 1) {
  return {
    sql: `NOT l.duplicate AND ${LOCAL_DATE} BETWEEN $${start} AND $${start + 1}${all ? '' : ` AND l.source = 'Ad'`}`,
    params: [from, to],
  };
}

async function leadTotals(from, to, all, followupDays) {
  const f = leadFilter(from, to, all);
  return one(
    `SELECT count(*) AS leads,
            count(DISTINCT ${NAME_KEY}) AS unique_leads,
            count(DISTINCT ${NAME_KEY}) FILTER (WHERE l.status = 'Won') AS won_unique,
            count(DISTINCT ${NAME_KEY}) FILTER (WHERE l.quoted_at IS NOT NULL) AS quoted_unique,
            count(*) FILTER (WHERE l.status = 'Won') AS sales,
            COALESCE(sum(l.amount) FILTER (WHERE l.status = 'Won'), 0) AS revenue,
            count(*) FILTER (WHERE l.quoted_at IS NOT NULL) AS quoted,
            count(*) FILTER (WHERE l.status = 'Lost' AND l.lost_reason = $3) AS junk,
            count(*) FILTER (WHERE l.status = 'New'
                             AND l.created_at < now() - make_interval(days => $4)) AS waiting,
            COALESCE(sum(l.amount) FILTER (WHERE l.status IN ('New', 'Quoted')), 0) AS open_value,
            count(*) FILTER (WHERE l.status IN ('New', 'Quoted') AND l.amount IS NOT NULL) AS open_priced,
            count(*) FILTER (WHERE l.status IN ('New', 'Quoted')) AS open_count,
            COALESCE(sum(l.amount) FILTER (WHERE l.status = 'Lost'), 0) AS lost_value
     FROM leads l WHERE ${f.sql}`,
    [...f.params, REASON_JUNK, followupDays],
  );
}

async function adTotals(from, to) {
  const t = await one(
    `WITH r AS (${REPORTS_IN_RANGE})
     SELECT COALESCE(sum(spend * f), 0) AS spend, COALESCE(sum(impressions * f), 0) AS impressions,
            COALESCE(sum(results * f), 0) AS results,
            COALESCE(sum(results * f) FILTER (WHERE result_kind = 'chat'), 0) AS chats,
            COALESCE(sum(results * f) FILTER (WHERE result_kind = 'lead_form'), 0) AS forms,
            count(*) AS reports
     FROM r`,
    [from, to],
  );
  // "conversations" = leads the ads generated, as Meta counts them.
  return {
    spend: Math.round(t.spend * 100) / 100,
    impressions: Math.round(t.impressions),
    conversations: Math.round(t.results),
    chats: Math.round(t.chats),
    forms: Math.round(t.forms),
    clicks: 0,
    reports: t.reports,
  };
}

async function lostReasons(from, to, all) {
  const f = leadFilter(from, to, all);
  return query(
    `SELECT l.lost_reason AS reason, count(*) AS count FROM leads l
     WHERE ${f.sql} AND l.status = 'Lost' GROUP BY l.lost_reason ORDER BY count DESC, reason`,
    f.params,
  );
}

function headline(ad, leads) {
  return {
    spend: ad.spend,
    generated: ad.conversations,
    chats: ad.chats,
    forms: ad.forms,
    leads: leads.leads,
    uniqueLeads: leads.unique_leads,
    sales: leads.sales,
    invoicedCustomers: leads.won_unique,
    revenue: leads.revenue,
    roas: ratio(leads.revenue, ad.spend),
    // Cost per lead the ads generated (Meta's count), falling back to logged leads.
    cpl: ratio(ad.spend, ad.conversations || leads.unique_leads),
    costPerCustomer: ratio(ad.spend, leads.won_unique),
  };
}

const pct = (x) => `${Math.round(x * 100)}%`;
const aed = (x) => `AED ${Math.round(x).toLocaleString('en-US')}`;

// The rules from the PRD, applied in order; the first match wins.
// Always computed on ad leads only, since the funnel starts at the ad.
export function diagnose({ ad, leads, prevAd, prevLeads, reasons, t }) {
  if (leads.leads < t.min_leads && ad.conversations < t.min_leads) {
    return {
      level: 'info', check: 'data',
      text: `Not enough data yet: ${leads.leads} ad lead${leads.leads === 1 ? '' : 's'} logged in this period.`,
    };
  }
  const logged = ratio(leads.unique_leads, ad.conversations);
  if (logged !== null && logged < t.logging_min) {
    const missing = ad.conversations - leads.unique_leads;
    return {
      level: 'critical', check: 'logging',
      text:
        leads.unique_leads === leads.won_unique
          ? `The ads generated ${ad.conversations} leads, but only ${leads.won_unique} became invoiced customers. Ask the sales team what happened to the other ${missing}.`
          : `The ads generated ${ad.conversations} leads, but only ${leads.unique_leads} customers are on record and ${leads.won_unique} were invoiced. Ask the sales team what happened to the other ${missing}.`,
      missing,
    };
  }
  const junk = ratio(leads.junk, leads.leads);
  if (junk !== null && junk > t.junk_max) {
    return {
      level: 'critical', check: 'quality',
      text: `${pct(junk)} of leads were not real enquiries. Ads are reaching the wrong people: review targeting.`,
    };
  }
  const waiting = ratio(leads.waiting, leads.leads);
  if (waiting !== null && waiting > t.followup_max) {
    return {
      level: 'warning', check: 'followup',
      text: `${leads.waiting} leads (${pct(waiting)}) are still New after ${t.followup_days} days. Sales follow-up is slow.`,
    };
  }
  const winRate = ratio(leads.sales, leads.quoted);
  if (winRate !== null && winRate < t.win_rate_min && reasons[0]?.reason === REASON_PRICE) {
    return {
      level: 'warning', check: 'pricing',
      text: `Only ${pct(winRate)} of quoted leads were won, and price is the top reason for losing. Quotes are losing on price.`,
    };
  }
  const cpl = ratio(ad.spend, leads.leads);
  const prevCpl = ratio(prevAd.spend, prevLeads.leads);
  if (cpl !== null && prevCpl && cpl / prevCpl - 1 > t.cpl_rise_max) {
    return {
      level: 'warning', check: 'adcost',
      text: `Cost per lead rose ${pct(cpl / prevCpl - 1)} to ${aed(cpl)}. Ads are getting more expensive: refresh the creative.`,
    };
  }
  const roas = ratio(leads.revenue, ad.spend);
  return {
    level: 'good', check: 'healthy',
    text: `The funnel looks healthy: ${leads.leads} leads, ${leads.sales} sales${roas !== null ? `, ${roas.toFixed(1)}x return on ad spend` : ''}.`,
  };
}

async function trend(to, all) {
  const end = mondayOf(to);
  const start = addDays(end, -7 * 11);
  return query(
    `WITH weeks AS (
       SELECT generate_series($1::date, $2::date, interval '7 days')::date AS week_start
     )
     SELECT w.week_start,
            COALESCE((SELECT sum(ar.spend * (LEAST(ar.period_end, w.week_start + 6) - GREATEST(ar.period_start, w.week_start) + 1)::numeric
                                 / (ar.period_end - ar.period_start + 1))
                      FROM ad_reports ar WHERE ar.period_start <= w.week_start + 6 AND ar.period_end >= w.week_start), 0) AS spend,
            COALESCE((SELECT sum(l.amount) FROM leads l
                      WHERE l.status = 'Won' AND NOT l.duplicate ${all ? '' : `AND l.source = 'Ad'`}
                        AND ${LOCAL_DATE} BETWEEN w.week_start AND w.week_start + 6), 0) AS revenue
     FROM weeks w ORDER BY w.week_start`,
    [start, end],
  );
}

async function byCampaign(from, to) {
  // Meta's own figures per campaign for the range. Reach can't be split by
  // days, so it shows only when the range covers the whole report.
  const rows = await query(
    `WITH r AS (${REPORTS_IN_RANGE})
     SELECT c.id, c.name, c.active,
            sum(r.spend * r.f) AS spend, sum(r.impressions * r.f) AS impressions, sum(r.results * r.f) AS results,
            CASE WHEN count(*) = 1 AND min(r.f) >= 0.9999 THEN max(r.reach) END AS reach,
            max(r.result_label) AS result_label, max(r.daily_budget) AS daily_budget,
            (array_agg(r.delivery ORDER BY r.period_end DESC))[1] AS delivery
     FROM r JOIN campaigns c ON c.id = r.campaign_id
     GROUP BY c.id ORDER BY spend DESC`,
    [from, to],
  );
  return rows.map((r) => ({
    ...r,
    spend: Math.round(r.spend * 100) / 100,
    impressions: Math.round(r.impressions),
    results: Math.round(r.results),
    costPerResult: ratio(r.spend, Math.round(r.results)),
  }));
}

async function bySalesperson(from, to, all, followupDays) {
  const f = leadFilter(from, to, all);
  return query(
    `SELECT l.handled_by AS name, count(*) AS leads,
            count(*) FILTER (WHERE l.status = 'Won') AS sales,
            COALESCE(sum(l.amount) FILTER (WHERE l.status = 'Won'), 0) AS revenue,
            count(*) FILTER (WHERE l.status = 'New'
                             AND l.created_at < now() - make_interval(days => $3)) AS waiting
     FROM leads l WHERE ${f.sql}
     GROUP BY l.handled_by ORDER BY revenue DESC, leads DESC`,
    [...f.params, followupDays],
  ).then((rows) => rows.map((r) => ({ ...r, winShare: ratio(r.sales, r.leads) })));
}

async function byChannel(from, to, all) {
  const f = leadFilter(from, to, all);
  return query(
    `SELECT l.channel AS name, count(*) AS leads,
            count(*) FILTER (WHERE l.status = 'Won') AS sales,
            COALESCE(sum(l.amount) FILTER (WHERE l.status = 'Won'), 0) AS revenue
     FROM leads l WHERE ${f.sql}
     GROUP BY l.channel ORDER BY leads DESC, revenue DESC`,
    f.params,
  ).then((rows) => rows.map((r) => ({ ...r, winShare: ratio(r.sales, r.leads) })));
}

// Numbers for one period, used by both the dashboard and the weekly summary.
export async function periodReport(from, to, all = false) {
  const { thresholds: t } = await getSettings();
  const n = daysBetween(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -n);

  const [ad, adLeads, prevAd, prevAdLeads, reasons] = await Promise.all([
    adTotals(from, to),
    leadTotals(from, to, false, t.followup_days),
    adTotals(prevFrom, prevTo),
    leadTotals(prevFrom, prevTo, false, t.followup_days),
    lostReasons(from, to, false),
  ]);
  const [shown, prevShown] = all
    ? await Promise.all([leadTotals(from, to, true, t.followup_days), leadTotals(prevFrom, prevTo, true, t.followup_days)])
    : [adLeads, prevAdLeads];

  return {
    range: { from, to, prevFrom, prevTo, includeOther: all },
    headline: headline(ad, shown),
    previous: headline(prevAd, prevShown),
    funnel: {
      impressions: ad.impressions,
      generated: ad.conversations,
      chats: ad.chats,
      forms: ad.forms,
      onRecord: adLeads.unique_leads,
      quoted: adLeads.quoted_unique,
      invoiced: adLeads.won_unique,
      invoices: adLeads.sales,
      revenue: adLeads.revenue,
    },
    // Ticket values: what's still in play and what was lost, in AED.
    values: { open: shown.open_value, openCount: shown.open_count, openPriced: shown.open_priced, lost: shown.lost_value },
    diagnosis: diagnose({ ad, leads: adLeads, prevAd, prevLeads: prevAdLeads, reasons, t }),
    lostReasons: all ? await lostReasons(from, to, true) : reasons,
    thresholds: t,
  };
}

export async function dashboard(params) {
  const from = params.get('from');
  const to = params.get('to');
  if (!isoDate.test(from ?? '') || !isoDate.test(to ?? '') || from > to) {
    throw new HttpError(400, 'Pick a valid date range');
  }
  const all = params.get('all') === '1';
  const report = await periodReport(from, to, all);
  const [trendRows, campaigns, people, channels] = await Promise.all([
    trend(to, all),
    byCampaign(from, to),
    bySalesperson(from, to, all, report.thresholds.followup_days),
    byChannel(from, to, all),
  ]);
  return { ...report, trend: trendRows, byCampaign: campaigns, bySalesperson: people, byChannel: channels };
}
