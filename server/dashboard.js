import { query, one } from './db.js';
import { HttpError, isoDate } from './http.js';
import { getSettings } from './settings.js';
import { REASON_JUNK, REASON_PRICE, TIME_ZONE } from '../shared/constants.js';

// All dates are UAE calendar dates as 'YYYY-MM-DD'. Leads are bucketed by the
// UAE date they were logged; ad numbers by the Monday their week starts.
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
            count(*) FILTER (WHERE l.status = 'Won') AS sales,
            COALESCE(sum(l.amount) FILTER (WHERE l.status = 'Won'), 0) AS revenue,
            count(*) FILTER (WHERE l.quoted_at IS NOT NULL) AS quoted,
            count(*) FILTER (WHERE l.status = 'Lost' AND l.lost_reason = $3) AS junk,
            count(*) FILTER (WHERE l.status = 'New'
                             AND l.created_at < now() - make_interval(days => $4)) AS waiting
     FROM leads l WHERE ${f.sql}`,
    [...f.params, REASON_JUNK, followupDays],
  );
}

async function adTotals(from, to) {
  return one(
    `SELECT COALESCE(sum(spend), 0) AS spend, COALESCE(sum(impressions), 0) AS impressions,
            COALESCE(sum(clicks), 0) AS clicks, COALESCE(sum(conversations), 0) AS conversations
     FROM ad_stats WHERE week_start BETWEEN $1 AND $2`,
    [mondayOf(from), to],
  );
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
    leads: leads.leads,
    sales: leads.sales,
    revenue: leads.revenue,
    roas: ratio(leads.revenue, ad.spend),
    cpl: ratio(ad.spend, leads.leads),
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
  const logged = ratio(leads.leads, ad.conversations);
  if (logged !== null && logged < t.logging_min) {
    return {
      level: 'critical', check: 'logging',
      text: `Only ${leads.leads} of ${ad.conversations} WhatsApp conversations were logged (${pct(logged)}). Leads are not being logged, so the numbers below cannot be trusted yet.`,
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
            COALESCE((SELECT sum(spend) FROM ad_stats a WHERE a.week_start = w.week_start), 0) AS spend,
            COALESCE((SELECT sum(l.amount) FROM leads l
                      WHERE l.status = 'Won' AND NOT l.duplicate ${all ? '' : `AND l.source = 'Ad'`}
                        AND ${LOCAL_DATE} BETWEEN w.week_start AND w.week_start + 6), 0) AS revenue
     FROM weeks w ORDER BY w.week_start`,
    [start, end],
  );
}

async function byCampaign(from, to) {
  // Ad leads only: an "Other" lead has no campaign.
  return query(
    `SELECT c.id, c.name, COALESCE(a.spend, 0) AS spend, COALESCE(x.leads, 0) AS leads,
            COALESCE(x.sales, 0) AS sales, COALESCE(x.revenue, 0) AS revenue
     FROM campaigns c
     LEFT JOIN (SELECT campaign_id, sum(spend) AS spend FROM ad_stats
                WHERE week_start BETWEEN $3 AND $2 GROUP BY campaign_id) a ON a.campaign_id = c.id
     LEFT JOIN (SELECT l.campaign_id, count(*) AS leads,
                       count(*) FILTER (WHERE l.status = 'Won') AS sales,
                       sum(l.amount) FILTER (WHERE l.status = 'Won') AS revenue
                FROM leads l
                WHERE NOT l.duplicate AND l.source = 'Ad' AND ${LOCAL_DATE} BETWEEN $1 AND $2
                GROUP BY l.campaign_id) x ON x.campaign_id = c.id
     WHERE COALESCE(a.spend, 0) > 0 OR COALESCE(x.leads, 0) > 0
     ORDER BY revenue DESC, spend DESC`,
    [from, to, mondayOf(from)],
  ).then((rows) =>
    rows.map((r) => ({ ...r, cpl: ratio(r.spend, r.leads), roas: ratio(r.revenue, r.spend) })),
  );
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
      clicks: ad.clicks,
      conversations: ad.conversations,
      leads: adLeads.leads,
      quoted: adLeads.quoted,
      won: adLeads.sales,
    },
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
  const [trendRows, campaigns, people] = await Promise.all([
    trend(to, all),
    byCampaign(from, to),
    bySalesperson(from, to, all, report.thresholds.followup_days),
  ]);
  return { ...report, trend: trendRows, byCampaign: campaigns, bySalesperson: people };
}
