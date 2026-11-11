// Values shared by the browser and the server.

export const STATUSES = ['New', 'Quoted', 'Won', 'Lost'];
export const SOURCES = ['Ad', 'Other'];

// Fixed on purpose: the diagnosis rules depend on two of these by name.
export const LOST_REASONS = [
  'Price too high',
  'Stopped replying',
  'Not a real enquiry',
  'Service not offered',
  'Other',
];
export const REASON_PRICE = 'Price too high';
export const REASON_JUNK = 'Not a real enquiry';

export const DEFAULT_THRESHOLDS = {
  logging_min: 0.7, // leads logged / Meta conversations
  junk_max: 0.3, // share of leads lost as "Not a real enquiry"
  followup_max: 0.25, // share of leads still New after followup_days
  followup_days: 2,
  win_rate_min: 0.2, // won / quoted
  cpl_rise_max: 0.3, // cost per lead rise vs previous period
  min_leads: 5, // below this, the diagnosis says there is not enough data
};

// Indian mobile numbers: keep the last 10 digits.
export function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}
