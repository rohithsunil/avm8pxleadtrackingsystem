// Formatting for a UAE client: dirhams (AED) and Dubai dates.

const TIME_ZONE = 'Asia/Dubai';
const number = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 });

/** "AED 12,500" */
export const aed = (n) => (n === null || n === undefined ? '–' : `AED ${number.format(n)}`);
/** "12,500" for places where the AED label sits beside the figure */
export const money = (n) => (n === null || n === undefined ? '–' : number.format(n));
export const count = (n) => (n === null || n === undefined ? '–' : number.format(n));
export const pct = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);
export const times = (x) => (x === null || x === undefined ? '–' : `${x.toFixed(1)}×`);

/** Compact axis labels: 1.2k, 45k, 1.3M */
export function aedShort(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** Stored phones are international digits (971501234567); show "+971 50 123 4567". */
export function phoneDisplay(digits) {
  if (!digits) return '';
  const uae = /^971(5\d)(\d{3})(\d{4})$/.exec(digits);
  if (uae) return `+971 ${uae[1]} ${uae[2]} ${uae[3]}`;
  const uaeLandline = /^971(\d)(\d{3})(\d{4})$/.exec(digits);
  if (uaeLandline) return `+971 ${uaeLandline[1]} ${uaeLandline[2]} ${uaeLandline[3]}`;
  return `+${digits}`;
}

// ---- Dates: all calendar dates are Dubai dates as 'YYYY-MM-DD' ----

export function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

export function toIso(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(iso) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -((day + 6) % 7));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDate(iso) {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function rangeLabel(from, to) {
  return from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
}

export function presetRange(preset) {
  const today = todayLocal();
  if (preset === 'week') return { from: mondayOf(today), to: today };
  if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: addDays(mondayOf(today), -21), to: today }; // last 4 weeks, starting on a Monday
}

export function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function timeAgo(timestamp) {
  const minutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
}

export function fullDate(timestamp) {
  return new Date(timestamp).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE,
  });
}

export function isWaiting(lead, days = 2) {
  return lead.status === 'New' && !lead.duplicate && Date.now() - new Date(lead.created_at) > days * 86400000;
}
