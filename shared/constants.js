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

// Phones are stored as international digits without the plus: 971501234567.
// Local UAE formats (050 123 4567, 50 123 4567, 04 123 4567) get the 971 code;
// anything else is taken as already including its country code.
export function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^0[1-9]\d{7,8}$/.test(digits)) return `971${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `971${digits}`;
  return digits;
}

export const isValidPhone = (digits) => digits.length >= 10 && digits.length <= 15;

export const TIME_ZONE = 'Asia/Dubai';
export const CURRENCY = 'AED';
