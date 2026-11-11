import { useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../session.jsx';
import { Button, Card, ErrorNote, Field, Input, PageTitle, useToast } from '../components/ui.jsx';

// A simple editable list of names (services, staff).
function NameList({ title, note, settingKey, items }) {
  const { refreshOptions } = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  async function save(next, message) {
    setError('');
    try {
      await api('/settings', { method: 'PUT', body: { [settingKey]: next } });
      await refreshOptions();
      toast(message);
    } catch (err) {
      setError(err.message);
    }
  }

  function add(e) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (items.some((i) => i.toLowerCase() === name.toLowerCase())) return setError(`"${name}" is already on the list`);
    setDraft('');
    save([...items, name], 'Added');
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      <ul className="divide-y divide-line rounded-[10px] border border-line">
        {items.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">Nothing added yet.</li>}
        {items.map((item) => (
          <li key={item} className="flex items-center justify-between px-3 py-1.5">
            <span>{item}</span>
            <button
              type="button"
              className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-bad"
              onClick={() => window.confirm(`Remove "${item}"? Past leads keep it.`) && save(items.filter((i) => i !== item), 'Removed')}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a name" aria-label={`Add to ${title}`} />
        <Button type="submit" variant="secondary">
          Add
        </Button>
      </form>
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}

function CampaignRow({ campaign, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: campaign.name, prefilled_message: campaign.prefilled_message });
  const [error, setError] = useState('');

  async function patch(body, message) {
    setError('');
    try {
      await api(`/campaigns/${campaign.id}`, { method: 'PATCH', body });
      await onChanged();
      setEditing(false);
      toast(message);
    } catch (err) {
      setError(err.fields?.name || err.message);
    }
  }

  if (editing) {
    return (
      <li className="space-y-2 px-3 py-3">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Campaign name" />
        <Input value={form.prefilled_message} onChange={(e) => setForm({ ...form, prefilled_message: e.target.value })} aria-label="Pre-filled message" placeholder="Pre-filled WhatsApp message" />
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          <Button className="min-h-10 text-sm" onClick={() => patch(form, 'Campaign saved')}>
            Save
          </Button>
          <Button variant="secondary" className="min-h-10 text-sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {campaign.name}
            {!campaign.active && <span className="ml-2 text-sm font-normal text-muted">Inactive</span>}
          </p>
          {campaign.prefilled_message && <p className="text-sm text-muted">"{campaign.prefilled_message}"</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="rounded-lg px-2 py-1.5 text-sm text-accent" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className="rounded-lg px-2 py-1.5 text-sm text-muted"
            onClick={() => patch({ active: !campaign.active }, campaign.active ? 'Campaign ended' : 'Campaign active')}
          >
            {campaign.active ? 'End' : 'Restart'}
          </button>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </li>
  );
}

function Campaigns({ campaigns }) {
  const { refreshOptions } = useSession();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', prefilled_message: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api('/campaigns', { method: 'POST', body: form });
      await refreshOptions();
      setForm({ name: '', prefilled_message: '' });
      toast('Campaign added');
    } catch (err) {
      setErrors({ ...err.fields, _: err.fields?.name ? '' : err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Campaigns</h2>
        <p className="text-sm text-muted">
          Give each ad its own pre-filled WhatsApp message, so the customer's first message shows which ad they came from. Ending a
          campaign hides it from the lead form and keeps its history.
        </p>
      </div>
      {campaigns.length > 0 && (
        <ul className="divide-y divide-line rounded-[10px] border border-line">
          {campaigns.map((c) => (
            <CampaignRow key={c.id} campaign={c} onChanged={refreshOptions} />
          ))}
        </ul>
      )}
      <form onSubmit={add} className="space-y-3 rounded-[10px] bg-page p-3">
        <Field label="New campaign name" error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Visiting cards – Nov" />
        </Field>
        <Field label="Pre-filled WhatsApp message" optional>
          <Input
            value={form.prefilled_message}
            onChange={(e) => setForm({ ...form, prefilled_message: e.target.value })}
            placeholder="Hi, I saw your ad for visiting cards"
          />
        </Field>
        <ErrorNote>{errors._}</ErrorNote>
        <Button type="submit" busy={busy} variant="secondary">
          Add campaign
        </Button>
      </form>
    </Card>
  );
}

const THRESHOLD_FIELDS = [
  { key: 'logging_min', label: 'Logged leads below this share of Meta conversations', percent: true },
  { key: 'junk_max', label: 'Leads lost as "not a real enquiry" above', percent: true },
  { key: 'followup_max', label: 'Leads still New above', percent: true },
  { key: 'followup_days', label: '"Still New" means older than (days)' },
  { key: 'win_rate_min', label: 'Quoted leads won below', percent: true },
  { key: 'cpl_rise_max', label: 'Cost per lead rise above', percent: true },
  { key: 'min_leads', label: 'Minimum leads before judging' },
];

function Thresholds({ thresholds }) {
  const { refreshOptions } = useSession();
  const toast = useToast();
  const toForm = (t) =>
    Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f.key, String(f.percent ? Math.round(t[f.key] * 100) : t[f.key])]));
  const [form, setForm] = useState(() => toForm(thresholds));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f.key, f.percent ? Number(form[f.key]) / 100 : Number(form[f.key])]));
      await api('/settings', { method: 'PUT', body: { thresholds: body } });
      await refreshOptions();
      toast('Thresholds saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="space-y-3">
        <div>
          <h2 className="font-semibold">Diagnosis thresholds</h2>
          <p className="text-sm text-muted">When the dashboard flags a problem. These are starting values; tune them after four weeks of real data.</p>
        </div>
        {THRESHOLD_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3">
            <span className="text-sm">{f.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="num min-h-10 w-20 rounded-lg border border-line bg-card px-2 text-right"
              />
              <span className="w-4 text-sm text-muted">{f.percent ? '%' : ''}</span>
            </span>
          </label>
        ))}
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" busy={busy} variant="secondary">
          Save thresholds
        </Button>
      </form>
    </Card>
  );
}

export default function Settings() {
  const { options, signOut } = useSession();
  return (
    <div className="space-y-4">
      <PageTitle
        action={
          <button type="button" onClick={signOut} className="text-sm text-muted md:hidden">
            Sign out
          </button>
        }
      >
        Settings
      </PageTitle>
      <Campaigns campaigns={options.campaigns} />
      <div className="grid gap-4 md:grid-cols-2">
        <NameList title="Services" note="What AVM sells. Shown in the lead form." settingKey="services" items={options.services} />
        <NameList title="Staff" note="Who handles leads at AVM." settingKey="staff" items={options.staff} />
      </div>
      <Thresholds thresholds={options.thresholds} />
    </div>
  );
}
