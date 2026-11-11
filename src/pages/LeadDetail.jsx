import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeftIcon, ClockAlertIcon, CopyXIcon, MessageCircleIcon, PencilIcon, PhoneIcon } from 'lucide-react';
import { api } from '@/lib/api.js';
import { aed, fullDate, isWaiting, phoneDisplay, timeAgo } from '@/lib/format.js';
import { CHANNEL_DOT } from '@/lib/leadFields.js';
import { useSession } from '@/session.jsx';
import LeadForm from '@/components/LeadForm.jsx';
import { ErrorAlert, LoadingBlock, Section, StatusBadge, useConfirm } from '@/components/app.jsx';
import { Alert, AlertAction, AlertDescription } from '@/components/reui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

const STATUS_ON = {
  New: 'aria-pressed:border-foreground/30 aria-pressed:bg-foreground/[0.06] aria-pressed:text-foreground',
  Quoted: 'aria-pressed:border-warning/40 aria-pressed:bg-warning/10 aria-pressed:text-warning-foreground',
  Won: 'aria-pressed:border-success/40 aria-pressed:bg-success/10 aria-pressed:text-success-foreground',
  Lost: 'aria-pressed:border-destructive/40 aria-pressed:bg-destructive/10 aria-pressed:text-destructive-foreground',
};

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

// Big status buttons: New/Quoted save at once, Won/Lost ask for one more detail.
function StatusUpdate({ lead, onSaved }) {
  const { options } = useSession();
  const [pending, setPending] = useState(null); // 'Won' | 'Lost' while asking for details
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(status, extra = {}) {
    setBusy(true);
    setError('');
    try {
      const updated = await api(`/leads/${lead.id}`, { method: 'PATCH', body: { status, ...extra } });
      setPending(null);
      onSaved(updated);
      toast.success(`Marked as ${status}`);
    } catch (err) {
      setError(err.fields?.amount || err.fields?.lost_reason || err.message);
    } finally {
      setBusy(false);
    }
  }

  function pick(status) {
    if (!status) return;
    setError('');
    if (status === 'Won') {
      setAmount(lead.amount ? String(lead.amount) : '');
      return setPending('Won');
    }
    if (status === 'Lost') {
      setReason(lead.lost_reason ?? '');
      return setPending('Lost');
    }
    if (status !== lead.status) save(status);
    else setPending(null);
  }

  return (
    <Section title="Update status" description="Won and Lost ask for one more detail.">
      <div className="space-y-4">
        <ToggleGroup value={[pending ?? lead.status]} onValueChange={(v) => pick(v[0] ?? pending ?? lead.status)} spacing={2} className="grid w-full grid-cols-4" aria-label="Status">
          {options.statuses.map((s) => (
            <ToggleGroupItem key={s} value={s} variant="outline" className={cn('h-12 w-full rounded-xl bg-card font-semibold', STATUS_ON[s])}>
              {s}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {pending === 'Won' && (
          <div className="flex animate-in items-end gap-2 fade-in slide-in-from-top-1">
            <Field className="flex-1">
              <FieldLabel htmlFor="won-amount">Order value</FieldLabel>
              <InputGroup className="h-11 rounded-xl">
                <InputGroupAddon>
                  <InputGroupText className="font-semibold">AED</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput id="won-amount" type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus className="num text-base" />
              </InputGroup>
            </Field>
            <Button className="h-11 rounded-xl px-5" disabled={busy} onClick={() => save('Won', { amount: amount === '' ? null : Number(amount) })}>
              {busy && <Spinner />} Save
            </Button>
          </div>
        )}
        {pending === 'Lost' && (
          <div className="flex animate-in items-end gap-2 fade-in slide-in-from-top-1">
            <Field className="flex-1">
              <FieldLabel htmlFor="lost-reason">Why was it lost?</FieldLabel>
              <NativeSelect id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full [&_select]:h-11 [&_select]:rounded-xl [&_select]:text-base">
                <NativeSelectOption value="">Choose a reason…</NativeSelectOption>
                {options.lostReasons.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {r}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button className="h-11 rounded-xl px-5" disabled={busy} onClick={() => save('Lost', { lost_reason: reason || null })}>
              {busy && <Spinner />} Save
            </Button>
          </div>
        )}
        <ErrorAlert>{error}</ErrorAlert>
      </div>
    </Section>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const { options } = useSession();
  const confirm = useConfirm();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api(`/leads/${id}`).then(setLead, (err) => setError(err.message));
  }, [id]);

  async function setDuplicate(duplicate) {
    if (
      duplicate &&
      !(await confirm({
        title: 'Mark as a duplicate?',
        description: 'It will be left out of every count on the dashboard. You can undo this later.',
        confirmLabel: 'Mark duplicate',
        destructive: true,
      }))
    )
      return;
    try {
      setLead(await api(`/leads/${id}`, { method: 'PATCH', body: { duplicate } }));
      toast.success(duplicate ? 'Marked as duplicate' : 'Duplicate mark removed');
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !lead) return <ErrorAlert>{error}</ErrorAlert>;
  if (!lead) return <LoadingBlock rows={3} />;

  return (
    <div className="space-y-6">
      <Button variant="ghost" className="-ml-2 h-9 rounded-lg px-2 text-muted-foreground" nativeButton={false} render={<Link to="/leads" />}>
        <ArrowLeftIcon data-icon="inline-start" /> All leads
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge status={lead.status} />
            <span className="text-sm text-muted-foreground">Logged {timeAgo(lead.created_at)}</span>
          </div>
          <h1 className="font-display text-[2.5rem] leading-none md:text-5xl">{lead.customer_name}</h1>
          {lead.business_name && <p className="mt-2 text-lg text-muted-foreground">{lead.business_name}</p>}
        </div>
        {lead.amount > 0 && (
          <div className="text-right">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{lead.status === 'Won' ? 'Order value' : 'Ticket value'}</p>
            <p className="num font-display text-4xl">{aed(lead.amount)}</p>
          </div>
        )}
      </div>

      {lead.duplicate && (
        <Alert>
          <CopyXIcon />
          <AlertDescription>Marked as a duplicate and left out of all counts.</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => setDuplicate(false)}>
              Undo
            </Button>
          </AlertAction>
        </Alert>
      )}
      {isWaiting(lead, options.followupDays) && (
        <Alert variant="warning">
          <ClockAlertIcon />
          <AlertDescription>Still New after {timeAgo(lead.created_at).replace(' ago', '')}. Follow up today.</AlertDescription>
        </Alert>
      )}

      {editing ? (
        <Section title="Edit details">
          <LeadForm
            lead={lead}
            onSaved={(updated) => {
              setLead(updated);
              setEditing(false);
              toast.success('Changes saved');
            }}
            onCancel={() => setEditing(false)}
          />
        </Section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12 rounded-xl bg-card text-base" nativeButton={false} render={<a href={`tel:+${lead.phone}`} />}>
              <PhoneIcon data-icon="inline-start" /> Call
            </Button>
            <Button className="h-12 rounded-xl bg-[#1f9d55] text-base text-white hover:bg-[#1a8a4a]" nativeButton={false} render={<a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noreferrer" />}>
              <MessageCircleIcon data-icon="inline-start" /> WhatsApp
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <StatusUpdate lead={lead} onSaved={setLead} />
            <Section
              title="Details"
              action={
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  <PencilIcon data-icon="inline-start" /> Edit
                </Button>
              }
            >
              <dl className="divide-y text-[0.95rem]">
                <Row label="Number">{phoneDisplay(lead.phone)}</Row>
                <Row label="Service">{lead.service}</Row>
                <Row label="Came in on">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn('size-2 rounded-full', CHANNEL_DOT[lead.channel])} />
                    {lead.channel}
                  </span>
                </Row>
                {lead.campaign_name && <Row label="Campaign">{lead.campaign_name}</Row>}
                {!(lead.amount > 0) && <Row label="Ticket value"><span className="text-muted-foreground">Not set</span></Row>}
                {lead.status === 'Lost' && <Row label="Lost because">{lead.lost_reason}</Row>}
                <Row label="Handled by">{lead.handled_by}</Row>
                {lead.note && <Row label="Note">{lead.note}</Row>}
                <Row label="Logged">{fullDate(lead.created_at)}</Row>
              </dl>
            </Section>
          </div>

          <ErrorAlert>{error}</ErrorAlert>

          {!lead.duplicate && (
            <Button variant="ghost" className="h-10 rounded-xl text-muted-foreground hover:text-destructive" onClick={() => setDuplicate(true)}>
              <CopyXIcon data-icon="inline-start" /> Mark as duplicate
            </Button>
          )}
        </>
      )}
    </div>
  );
}
