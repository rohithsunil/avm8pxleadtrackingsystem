import { useState } from 'react';
import { toast } from 'sonner';
import { MegaphoneIcon, PencilIcon, PlusIcon, RotateCcwIcon, SquareIcon, XIcon } from 'lucide-react';
import { api } from '@/lib/api.js';
import { useSession } from '@/session.jsx';
import { ErrorAlert, PageHeader, Section, useConfirm } from '@/components/app.jsx';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';

// ---- Editable name lists (services, staff) ----

function NameList({ title, description, settingKey, items, placeholder }) {
  const { refreshOptions } = useSession();
  const confirm = useConfirm();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  async function save(next, message) {
    setError('');
    try {
      await api('/settings', { method: 'PUT', body: { [settingKey]: next } });
      await refreshOptions();
      toast.success(message);
    } catch (err) {
      setError(err.message);
    }
  }

  function add(e) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (items.some((i) => i.toLowerCase() === name.toLowerCase())) return setError(`“${name}” is already on the list`);
    setDraft('');
    save([...items, name], `Added ${name}`);
  }

  async function remove(item) {
    if (await confirm({ title: `Remove “${item}”?`, description: 'Leads already logged keep it.', confirmLabel: 'Remove', destructive: true })) {
      save(items.filter((i) => i !== item), `Removed ${item}`);
    }
  }

  return (
    <Section title={title} description={description}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing added yet.</p>}
          {items.map((item) => (
            <Badge key={item} variant="outline" radius="full" size="xl" className="h-8 gap-1 bg-card pr-1 pl-3 text-sm font-medium">
              {item}
              <button type="button" onClick={() => remove(item)} aria-label={`Remove ${item}`} className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <XIcon className="size-3.5" />
              </button>
            </Badge>
          ))}
        </div>
        <form onSubmit={add} className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label={`Add to ${title}`} className="h-10 rounded-xl" />
          <Button type="submit" variant="outline" className="h-10 rounded-xl">
            <PlusIcon data-icon="inline-start" /> Add
          </Button>
        </form>
        <ErrorAlert>{error}</ErrorAlert>
      </div>
    </Section>
  );
}

// ---- Campaigns ----

function CampaignRow({ campaign, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: campaign.name, prefilled_message: campaign.prefilled_message });
  const [error, setError] = useState('');

  async function patch(body, message) {
    setError('');
    try {
      await api(`/campaigns/${campaign.id}`, { method: 'PATCH', body });
      await onChanged();
      setEditing(false);
      toast.success(message);
    } catch (err) {
      setError(err.fields?.name || err.message);
    }
  }

  if (editing) {
    return (
      <li className="space-y-3 py-4">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Campaign name" className="h-10 rounded-xl" />
        <Input value={form.prefilled_message} onChange={(e) => setForm({ ...form, prefilled_message: e.target.value })} aria-label="Pre-filled message" placeholder="Pre-filled WhatsApp message" className="h-10 rounded-xl" />
        <ErrorAlert>{error}</ErrorAlert>
        <div className="flex gap-2">
          <Button className="rounded-lg" onClick={() => patch(form, 'Campaign saved')}>
            Save
          </Button>
          <Button variant="outline" className="rounded-lg" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <IconTile variant={campaign.active ? 'soft' : 'outline'} size="sm" className={campaign.active ? 'text-chart-1' : 'text-muted-foreground'}>
        <MegaphoneIcon />
      </IconTile>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold">
          {campaign.name}
          {!campaign.active && (
            <Badge variant="outline" radius="full">
              Ended
            </Badge>
          )}
        </p>
        {campaign.prefilled_message && <p className="mt-0.5 text-sm text-muted-foreground">“{campaign.prefilled_message}”</p>}
        <ErrorAlert className="mt-2">{error}</ErrorAlert>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label={`Edit ${campaign.name}`}>
          <PencilIcon />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => patch({ active: !campaign.active }, campaign.active ? 'Campaign ended' : 'Campaign restarted')}>
          {campaign.active ? <SquareIcon data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
          {campaign.active ? 'End' : 'Restart'}
        </Button>
      </div>
    </li>
  );
}

function Campaigns({ campaigns }) {
  const { refreshOptions } = useSession();
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
      toast.success('Campaign added');
    } catch (err) {
      setErrors({ ...err.fields, _: err.fields?.name ? '' : err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Campaigns" description="Give each ad its own pre-filled WhatsApp message, so the first message shows which ad the customer came from.">
      <div className="space-y-5">
        {campaigns.length > 0 && (
          <ul className="divide-y">
            {campaigns.map((c) => (
              <CampaignRow key={c.id} campaign={c} onChanged={refreshOptions} />
            ))}
          </ul>
        )}
        <form onSubmit={add} className="space-y-4 rounded-xl border border-dashed bg-muted/40 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="new-campaign">New campaign</FieldLabel>
              <Input id="new-campaign" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Business cards · Nov" aria-invalid={!!errors.name} className="h-10 rounded-xl bg-card" />
              <FieldError>{errors.name}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="new-message">Pre-filled WhatsApp message</FieldLabel>
              <Input id="new-message" value={form.prefilled_message} onChange={(e) => setForm({ ...form, prefilled_message: e.target.value })} placeholder="Hi, I saw your ad for business cards" className="h-10 rounded-xl bg-card" />
              <FieldDescription>Use the same text in the ad’s WhatsApp button.</FieldDescription>
            </Field>
          </div>
          <ErrorAlert>{errors._}</ErrorAlert>
          <Button type="submit" disabled={busy} className="rounded-lg">
            {busy ? <Spinner /> : <PlusIcon data-icon="inline-start" />} Add campaign
          </Button>
        </form>
      </div>
    </Section>
  );
}

// ---- Diagnosis thresholds ----

const THRESHOLD_FIELDS = [
  { key: 'logging_min', label: 'Flag logging when leads are below this share of Meta chats', percent: true },
  { key: 'junk_max', label: 'Flag ad quality when “not a real enquiry” is above', percent: true },
  { key: 'followup_max', label: 'Flag follow-up when leads still New are above', percent: true },
  { key: 'followup_days', label: '“Still New” means older than', unit: 'days' },
  { key: 'win_rate_min', label: 'Flag pricing when quoted leads won are below', percent: true },
  { key: 'cpl_rise_max', label: 'Flag ad cost when cost per lead rises more than', percent: true },
  { key: 'min_leads', label: 'Don’t judge until there are at least', unit: 'leads' },
];

function Thresholds({ thresholds }) {
  const { refreshOptions } = useSession();
  const toForm = (t) => Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f.key, String(f.percent ? Math.round(t[f.key] * 100) : t[f.key])]));
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
      toast.success('Thresholds saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Diagnosis thresholds" description="When the overview flags a problem. Starting values; tune them after four weeks of real data.">
      <form onSubmit={save} className="space-y-4">
        <div className="divide-y">
          {THRESHOLD_FIELDS.map((f) => (
            <label key={f.key} htmlFor={`t-${f.key}`} className="flex items-center justify-between gap-4 py-3 first:pt-0">
              <span className="text-sm">{f.label}</span>
              <InputGroup className="h-10 w-28 shrink-0 rounded-xl">
                <InputGroupInput id={`t-${f.key}`} type="number" min="0" inputMode="numeric" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="num text-right" />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{f.percent ? '%' : f.unit}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </label>
          ))}
        </div>
        <ErrorAlert>{error}</ErrorAlert>
        <Button type="submit" variant="outline" disabled={busy} className="rounded-lg">
          {busy && <Spinner />} Save thresholds
        </Button>
      </form>
    </Section>
  );
}

export default function Settings() {
  const { options } = useSession();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Set up once" title="Settings" />
      <Campaigns campaigns={options.campaigns} />
      <div className="grid gap-4 lg:grid-cols-2">
        <NameList title="Services" description="What AVM sells. Shown in the lead form." settingKey="services" items={options.services} placeholder="e.g. Vehicle wraps" />
        <NameList title="Staff" description="Who answers WhatsApp at AVM." settingKey="staff" items={options.staff} placeholder="e.g. Fatima" />
      </div>
      <Thresholds thresholds={options.thresholds} />
    </div>
  );
}
