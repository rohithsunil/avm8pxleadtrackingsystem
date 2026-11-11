const inrFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const inr = (n) => (n === null || n === undefined ? '–' : `₹${inrFormat.format(n)}`);
export const count = (n) => (n === null || n === undefined ? '–' : inrFormat.format(n));
export const pct = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);
export const times = (x) => (x === null || x === undefined ? '–' : `${x.toFixed(1)}x`);

// Short compact rupees for chart axes: ₹1.2L, ₹45k.
export function inrShort(n) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${n}`;
}

// ---- Dates: everything is an IST calendar date 'YYYY-MM-DD' ----

export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
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
  const today = todayIST();
  if (preset === 'week') return { from: mondayOf(today), to: today };
  if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: addDays(mondayOf(today), -21), to: today }; // last 4 weeks, starting on a Monday
}

export function timeAgo(timestamp) {
  const minutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function isWaiting(lead, days = 2) {
  return lead.status === 'New' && !lead.duplicate && Date.now() - new Date(lead.created_at) > days * 86400000;
}
