import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUpRightIcon, HistoryIcon, SparklesIcon } from 'lucide-react';
import { api, storage } from '@/lib/api.js';
import { aed, shortDate } from '@/lib/format.js';
import { adOptions, adValue, defaultAdValue, fromAdValue } from '@/lib/leadFields.js';
import { useSession } from '@/session.jsx';
import { ErrorAlert, StatusBadge } from '@/components/app.jsx';
import { PhoneInput } from '@/components/reui/phone-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

const HANDLER_KEY = 'avm:handled_by';
const AD_KEY = 'avm:ad';

// Phone-friendly control sizing used across the form.
const CONTROL = 'h-11 rounded-xl text-base md:h-10 md:text-sm';

const STATUS_ON = {
  New: 'aria-pressed:border-foreground/30 aria-pressed:bg-foreground/[0.06] aria-pressed:text-foreground',
  Quoted: 'aria-pressed:border-warning/40 aria-pressed:bg-warning/10 aria-pressed:text-warning-foreground',
  Won: 'aria-pressed:border-success/40 aria-pressed:bg-success/10 aria-pressed:text-success-foreground',
  Lost: 'aria-pressed:border-destructive/40 aria-pressed:bg-destructive/10 aria-pressed:text-destructive-foreground',
};

function blankLead(campaigns) {
  const remembered = storage.get(AD_KEY);
  const validAd = remembered && adOptions(campaigns).some((o) => o.value === remembered);
  return {
    customer_name: '',
    business_name: '',
    phone: '',
    service: '',
    channel: 'WhatsApp',
    ad: validAd ? remembered : defaultAdValue(campaigns),
    status: 'New',
    amount: '',
    lost_reason: '',
    handled_by: storage.get(HANDLER_KEY) ?? '',
    note: '',
  };
}

function fromLead(lead, campaigns) {
  return {
    ...blankLead(campaigns),
    ...Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v ?? ''])),
    phone: lead.phone ? `+${lead.phone}` : '',
    ad: adValue(lead),
    amount: lead.amount ? String(lead.amount) : '',
  };
}

function toPayload(form) {
  return {
    customer_name: form.customer_name,
    business_name: form.business_name,
    phone: form.phone,
    service: form.service,
    channel: form.channel,
    ...fromAdValue(form.ad),
    status: form.status,
    amount: form.status === 'Won' && form.amount !== '' ? Number(form.amount) : null,
    lost_reason: form.status === 'Lost' && form.lost_reason ? form.lost_reason : null,
    handled_by: form.handled_by,
    note: form.note,
  };
}

// ---- Paste to log (Claude) ----

function PasteBox({ onFill }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function fill() {
    if (text.trim().length < 3) return setMessage('Paste a message first.');
    setBusy(true);
    setMessage('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const { fields } = await api('/parse', { method: 'POST', body: { text }, signal: controller.signal });
      const found = Object.keys(fields).length;
      if (!found) setMessage('Nothing to fill from that text. Fill the form by hand.');
      else {
        onFill(fields);
        setText('');
        toast.success(`Filled ${found} field${found === 1 ? '' : 's'}. Check them, then save.`);
      }
    } catch (err) {
      setMessage(err.name === 'AbortError' ? 'That took too long. Fill the form by hand.' : err.message);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink p-4 text-ink-foreground md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <SparklesIcon className="size-4 text-brand-yellow" />
        <p className="text-sm font-semibold">Paste to fill</p>
        <span className="text-xs text-ink-muted">· Claude reads it for you</span>
      </div>
      <Textarea
        id="paste"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the WhatsApp message, or type: Ahmed, Al Noor Trading, 500 business cards, paid 750"
        className="min-h-20 rounded-xl border-ink-line bg-white/5 text-base text-ink-foreground placeholder:text-ink-muted focus-visible:border-brand-cyan md:text-sm"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={fill} disabled={busy} className="h-10 rounded-xl bg-ink-foreground px-4 text-ink hover:bg-white">
          {busy ? <Spinner /> : <SparklesIcon data-icon="inline-start" />}
          Fill form
        </Button>
        {message && <span className="text-sm text-ink-muted">{message}</span>}
      </div>
    </div>
  );
}

// ---- Earlier lead with the same phone number ----

function RepeatNotice({ matches, onContinue }) {
  const first = matches[0];
  const ref = useRef(null);
  // Bring it into view: after a paste-fill it can appear below the fold,
  // and Save stays disabled until staff answer it.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);
  return (
    <Alert variant="warning" ref={ref}>
      <HistoryIcon />
      <AlertTitle>This number was logged before</AlertTitle>
      <AlertDescription>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-foreground">
          <span className="font-medium">{first.customer_name}</span>
          <span className="text-muted-foreground">
            {first.service} · {shortDate(first.created_at)}
            {first.status === 'Won' && ` · ${aed(first.amount)}`}
          </span>
          <StatusBadge status={first.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" className="h-10 rounded-xl" nativeButton={false} render={<Link to={`/leads/${first.id}`} />}>
            Same enquiry: open it <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
          <Button variant="outline" className="h-10 rounded-xl" onClick={onContinue}>
            New order: continue
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function Segmented({ options, value, onChange, label, itemClass, columns }) {
  return (
    <ToggleGroup
      aria-label={label}
      value={value ? [value] : []}
      onValueChange={(v) => v.length && onChange(v[0])}
      spacing={2}
      className="grid w-full"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o}
          value={o}
          variant="outline"
          className={cn(
            'h-11 w-full rounded-xl border bg-card text-[0.9rem] font-semibold aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background md:h-10',
            itemClass?.(o),
          )}
        >
          {o}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export default function LeadForm({ lead, onSaved, onCancel }) {
  const { options } = useSession();
  const isNew = !lead;
  const [form, setForm] = useState(() => (lead ? fromLead(lead, options.campaigns) : blankLead(options.campaigns)));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState({});
  const [repeat, setRepeat] = useState(null); // earlier leads with this phone, until dismissed
  const checkedPhone = useRef('');
  const top = useRef(null);

  const ads = adOptions(options.campaigns, lead?.campaign_id);

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((errs) => {
      const next = { ...errs };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  }
  const set = (key) => (e) => update({ [key]: e?.target ? e.target.value : e });

  async function checkPhone(phone) {
    if (!isNew) return;
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (digits.length < 10 || digits === checkedPhone.current) return;
    checkedPhone.current = digits;
    try {
      const { matches } = await api(`/leads/check-phone?phone=${encodeURIComponent(digits)}`);
      setRepeat(matches.length ? matches : null);
    } catch {
      /* not worth interrupting the form */
    }
  }

  function applyParsed(fields) {
    const patch = { ...fields };
    if (patch.campaign_id) patch.ad = `c:${patch.campaign_id}`;
    delete patch.campaign_id;
    delete patch.source;
    if (patch.amount) patch.amount = String(patch.amount);
    if (patch.phone) patch.phone = `+${patch.phone}`;
    update(patch);
    setHighlight(Object.fromEntries(Object.keys(patch).map((k) => [k, true])));
    setTimeout(() => setHighlight({}), 1800);
    if (patch.phone) checkPhone(patch.phone);
  }

  useEffect(() => {
    if (form.handled_by) storage.set(HANDLER_KEY, form.handled_by);
  }, [form.handled_by]);
  useEffect(() => {
    if (isNew && form.ad) storage.set(AD_KEY, form.ad);
  }, [isNew, form.ad]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const saved = isNew
        ? await api('/leads', { method: 'POST', body: toPayload(form) })
        : await api(`/leads/${lead.id}`, { method: 'PATCH', body: toPayload(form) });
      if (isNew) {
        // Ready for the next one; keep who is logging, the channel and the ad.
        setForm({ ...blankLead(options.campaigns), channel: form.channel, ad: form.ad });
        setRepeat(null);
        checkedPhone.current = '';
        top.current?.scrollIntoView({ behavior: 'smooth' });
      }
      onSaved?.(saved);
    } catch (err) {
      setErrors(err.fields ?? {});
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const glow = (k) => highlight[k] && 'ring-4 ring-brand-cyan/25 transition-shadow duration-700';

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      <div ref={top} className="scroll-mt-24" />
      {isNew && <PasteBox onFill={applyParsed} />}

      <FieldGroup className="gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Field data-invalid={!!errors.customer_name}>
            <FieldLabel htmlFor="customer_name">Customer name</FieldLabel>
            <Input id="customer_name" value={form.customer_name} onChange={set('customer_name')} autoComplete="off" aria-invalid={!!errors.customer_name} className={cn(CONTROL, glow('customer_name'))} />
            <FieldError>{errors.customer_name}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="business_name">
              Business <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id="business_name" value={form.business_name} onChange={set('business_name')} autoComplete="off" className={cn(CONTROL, glow('business_name'))} />
          </Field>
        </div>

        <Field data-invalid={!!errors.phone}>
          <FieldLabel htmlFor="phone">Phone number</FieldLabel>
          <PhoneInput
            id="phone"
            defaultCountry="AE"
            value={form.phone}
            onChange={(v) => update({ phone: v })}
            onBlur={() => checkPhone(form.phone)}
            aria-invalid={!!errors.phone}
            variant="lg"
            className={cn('[&_button]:h-11 [&_button]:rounded-s-xl [&_input]:h-11 [&_input]:rounded-e-xl [&_input]:text-base md:[&_button]:h-10 md:[&_input]:h-10 md:[&_input]:text-sm', glow('phone'))}
          />
          <FieldError>{errors.phone}</FieldError>
        </Field>
        {repeat && <RepeatNotice matches={repeat} onContinue={() => setRepeat(null)} />}

        <Field data-invalid={!!errors.service}>
          <FieldLabel htmlFor="service">Service</FieldLabel>
          <NativeSelect id="service" value={form.service} onChange={set('service')} aria-invalid={!!errors.service} className={cn('w-full [&_select]:h-11 [&_select]:rounded-xl [&_select]:text-base md:[&_select]:h-10 md:[&_select]:text-sm', glow('service'))}>
            <NativeSelectOption value="">Choose a service…</NativeSelectOption>
            {options.services.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {s}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError>{errors.service}</FieldError>
        </Field>

        <FieldSeparator />

        <div className="grid gap-5 md:grid-cols-2">
          <Field data-invalid={!!errors.channel}>
            <FieldLabel>Came in on</FieldLabel>
            <div className={cn('rounded-xl', glow('channel'))}>
              <Segmented label="Channel" options={options.channels} value={form.channel} onChange={set('channel')} itemClass={() => 'px-1 text-[0.82rem]'} />
            </div>
            <FieldError>{errors.channel}</FieldError>
          </Field>
          <Field data-invalid={!!errors.campaign_id}>
            <FieldLabel htmlFor="ad">From an ad?</FieldLabel>
            <NativeSelect id="ad" value={form.ad} onChange={set('ad')} aria-invalid={!!errors.campaign_id} className={cn('w-full [&_select]:h-11 [&_select]:rounded-xl [&_select]:text-base md:[&_select]:h-10 md:[&_select]:text-sm', glow('ad'))}>
              {ads.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError>{errors.campaign_id}</FieldError>
          </Field>
        </div>

        <Field>
          <FieldLabel>Status</FieldLabel>
          <div className={cn('rounded-xl', glow('status'))}>
            <Segmented
              label="Status"
              options={options.statuses}
              value={form.status}
              onChange={set('status')}
              itemClass={(o) => cn('aria-pressed:border', STATUS_ON[o])}
            />
          </div>
        </Field>

        {form.status === 'Won' && (
          <Field data-invalid={!!errors.amount} className="animate-in fade-in slide-in-from-top-1">
            <FieldLabel htmlFor="amount">Order value</FieldLabel>
            <InputGroup className={cn('h-11 rounded-xl md:h-10', glow('amount'))}>
              <InputGroupAddon>
                <InputGroupText className="font-semibold">AED</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="amount" type="number" inputMode="decimal" min="0" value={form.amount} onChange={set('amount')} placeholder="0" aria-invalid={!!errors.amount} className="num text-base md:text-sm" />
            </InputGroup>
            <FieldError>{errors.amount}</FieldError>
          </Field>
        )}

        {form.status === 'Lost' && (
          <Field data-invalid={!!errors.lost_reason} className="animate-in fade-in slide-in-from-top-1">
            <FieldLabel htmlFor="lost_reason">Why was it lost?</FieldLabel>
            <NativeSelect id="lost_reason" value={form.lost_reason} onChange={set('lost_reason')} aria-invalid={!!errors.lost_reason} className="w-full [&_select]:h-11 [&_select]:rounded-xl [&_select]:text-base md:[&_select]:h-10 md:[&_select]:text-sm">
              <NativeSelectOption value="">Choose a reason…</NativeSelectOption>
              {options.lostReasons.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {r}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError>{errors.lost_reason}</FieldError>
          </Field>
        )}

        <FieldSeparator />

        <div className="grid gap-5 md:grid-cols-2">
          <Field data-invalid={!!errors.handled_by}>
            <FieldLabel htmlFor="handled_by">Handled by</FieldLabel>
            {options.staff.length ? (
              <NativeSelect id="handled_by" value={form.handled_by} onChange={set('handled_by')} aria-invalid={!!errors.handled_by} className="w-full [&_select]:h-11 [&_select]:rounded-xl [&_select]:text-base md:[&_select]:h-10 md:[&_select]:text-sm">
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {options.staff.map((s) => (
                  <NativeSelectOption key={s} value={s}>
                    {s}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : (
              <>
                <Input id="handled_by" value={form.handled_by} onChange={set('handled_by')} placeholder="Your name" aria-invalid={!!errors.handled_by} className={CONTROL} />
                <FieldDescription>The agency can add staff names in Settings.</FieldDescription>
              </>
            )}
            <FieldError>{errors.handled_by}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="note">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input id="note" value={form.note} onChange={set('note')} maxLength={200} placeholder="Quantity, deadline…" className={cn(CONTROL, glow('note'))} />
          </Field>
        </div>
      </FieldGroup>

      <ErrorAlert>{formError}</ErrorAlert>

      {isNew ? (
        // Fixed above the bottom bar on phones so Save is always in reach.
        <div className="above-nav fixed inset-x-0 z-20 border-t bg-background/90 px-4 py-3 backdrop-blur-md md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <div className="mx-auto max-w-2xl">
            {repeat && <p className="mb-2 text-center text-sm text-warning-foreground">Choose an option above about the earlier lead.</p>}
            <Button type="submit" disabled={busy || !!repeat} className="h-12 w-full rounded-xl text-base">
              {busy && <Spinner />}
              Save lead
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="h-11 flex-1 rounded-xl">
            {busy && <Spinner />}
            Save changes
          </Button>
          <Button variant="outline" onClick={onCancel} className="h-11 rounded-xl">
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}

