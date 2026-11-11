// Shared lead-field helpers for the form, the table and the lead page.

// Ad attribution is one choice in the UI, stored as source + campaign_id:
//   'c:<id>' → that campaign · 'ad' → an ad, not sure which · 'none' → not from an ad
export function adValue(lead) {
  if (lead.source === 'Other') return 'none';
  return lead.campaign_id ? `c:${lead.campaign_id}` : 'ad';
}

export function fromAdValue(value) {
  if (value === 'none') return { source: 'Other', campaign_id: null };
  if (value?.startsWith('c:')) return { source: 'Ad', campaign_id: Number(value.slice(2)) };
  return { source: 'Ad', campaign_id: null };
}

export function adOptions(campaigns, keepId) {
  return [
    ...campaigns.filter((c) => c.active || c.id === keepId).map((c) => ({ value: `c:${c.id}`, label: c.name })),
    { value: 'ad', label: 'Ad, not sure which' },
    { value: 'none', label: 'Not from an ad' },
  ];
}

export function adLabel(lead) {
  if (lead.source === 'Other') return 'Not from an ad';
  return lead.campaign_name || 'Ad';
}

/** Sensible default: the only active campaign if there is just one, else "Ad, not sure which". */
export function defaultAdValue(campaigns) {
  const active = campaigns.filter((c) => c.active);
  return active.length === 1 ? `c:${active[0].id}` : 'ad';
}

export const CHANNEL_DOT = {
  WhatsApp: 'bg-[#25D366]',
  Instagram: 'bg-[#E1306C]',
  Facebook: 'bg-[#1877F2]',
  'Phone call': 'bg-foreground/60',
};
