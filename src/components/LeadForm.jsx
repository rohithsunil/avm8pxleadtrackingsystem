import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, storage } from '../lib/api.js';
import { shortDate } from '../lib/format.js';
import { useSession } from '../session.jsx';
import { Button, ChoiceGroup, ErrorNote, Field, Input, Select, StatusChip, cx, inputClass } from './ui.jsx';

const HANDLER_KEY = 'avm:handled_by';

function blankLead() {
  return {
    customer_name: '',
    business_name: '',
    phone: '',
    service: '',
    source: 'Ad',
    campaign_id: '',
    status: 'New',
    amount: '',
    lost_reason: '',
    handled_by: storage.get(HANDLER_KEY) ?? '',
    note: '',
  };
}

function fromLead(lead) {
  return {
    ...blankLead(),
    ...Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v ?? ''])),
    campaign_id: lead.campaign_id ? String(lead.campaign_id) : '',
    amount: lead.amount ? String(lead.amount) : '',
  };
}

function toPayload(form) {
  return {
    customer_name: form.customer_name,
    business_name: form.business_name,
    phone: form.phone,
    service: form.service,
    source: form.source,
    campaign_id: form.source === 'Ad' && form.campaign_id ? Number(form.campaign_id) : null,
    status: form.status,
    amount: form.status === 'Won' && form.amount !== '' ? Number(form.amount) : null,
    lost_reason: form.status === 'Lost' && form.lost_reason ? form.lost_reason : null,
    handled_by: form.handled_by,
    note: form.note,
  };
}

// ---- Paste to log ----

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
      }
    } catch (err) {
      setMessage(err.name === 'AbortError' ? 'That took too long. Fill the form by hand.' : err.message);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-accent/40 bg-accent/[0.03] p-3">
      <label htmlFor="paste" className="mb-1.5 block text-sm font-medium">
        Paste the customer's message or type a quick note
      </label>
      <textarea
        id="paste"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ravi, Sri Sai Traders, 1000 visiting cards, 2500 paid"
        className={cx(inputClass, 'min-h-20 py-2.5')}
      />
      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" busy={busy} onClick={fill} className="min-h-10 shrink-0 text-sm">
          Fill form
        </Button>
        {message && <span className="text-sm text-muted">{message}</span>}
      </div>
    </div>
  );
}

// ---- Earlier lead with the same phone number ----

function RepeatNotice({ matches, onContinue }) {
  const first = matches[0];
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/5 p-3 text-sm">
      <p className="font-medium">This number was logged before</p>
      <p className="mt-1 text-muted">
        {first.customer_name}
        {first.business_name && `, ${first.business_name}`} · {first.service} · {shortDate(first.created_at)}{' '}
        <StatusChip status={first.status} />
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/leads/${first.id}`} className="inline-flex min-h-10 items-center rounded-[10px] border border-line bg-card px-3 font-medium">
          Same enquiry: open it
        </Link>
        <Button variant="secondary" onClick={onContinue} className="min-h-10 text-sm">
          New order: continue
        </Button>
      </div>
    </div>
  );
}

export default function LeadForm({ lead, onSaved, onCancel }) {
  const { options } = useSession();
  const isNew = !lead;
  const [form, setForm] = useState(() => (lead ? fromLead(lead) : blankLead()));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState({});
  const [repeat, setRepeat] = useState(null); // earlier leads with this phone, until dismissed
  const checkedPhone = useRef('');
  const top = useRef(null);

  const campaigns = options.campaigns.filter((c) => c.active || String(c.id) === form.campaign_id);
  const set = (key) => (e) => update({ [key]: e?.target ? e.target.value : e });

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((errs) => {
      const next = { ...errs };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  }

  async function checkPhone(phone) {
    if (!isNew) return;
    const digits = phone.replace(/\D/g, '');
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
    if (patch.campaign_id) patch.campaign_id = String(patch.campaign_id);
    if (patch.amount) patch.amount = String(patch.amount);
    update(patch);
    setHighlight(Object.fromEntries(Object.keys(patch).map((k) => [k, true])));
    setTimeout(() => setHighlight({}), 1600);
    if (patch.phone) checkPhone(patch.phone);
  }

  useEffect(() => {
    if (form.handled_by) storage.set(HANDLER_KEY, form.handled_by);
  }, [form.handled_by]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const saved = isNew
        ? await api('/leads', { method: 'POST', body: toPayload(form) })
        : await api(`/leads/${lead.id}`, { method: 'PATCH', body: toPayload(form) });
      if (isNew) {
        // Ready for the next one; keep who is logging and the source.
        setForm({ ...blankLead(), source: form.source, campaign_id: form.campaign_id });
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

  const hl = (k) => highlight[k];

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div ref={top} />
      {isNew && <PasteBox onFill={applyParsed} />}

      <Field label="Customer name" error={errors.customer_name} highlight={hl('customer_name')}>
        <Input value={form.customer_name} onChange={set('customer_name')} autoComplete="off" error={errors.customer_name} />
      </Field>

      <Field label="Business name" optional error={errors.business_name} highlight={hl('business_name')}>
        <Input value={form.business_name} onChange={set('business_name')} autoComplete="off" />
      </Field>

      <Field label="Phone" error={errors.phone} highlight={hl('phone')}>
        <Input
          type="tel"
          inputMode="numeric"
          value={form.phone}
          onChange={set('phone')}
          onBlur={(e) => checkPhone(e.target.value)}
          placeholder="10-digit mobile number"
          error={errors.phone}
        />
      </Field>
      {repeat && <RepeatNotice matches={repeat} onContinue={() => setRepeat(null)} />}

      <Field label="Service" error={errors.service} highlight={hl('service')}>
        <Select value={form.service} onChange={set('service')} options={options.services} error={errors.service} placeholder="Choose a service…" />
      </Field>

      <Field label="Source" group>
        <ChoiceGroup ariaLabel="Source" options={['Ad', 'Other']} value={form.source} onChange={set('source')} />
      </Field>

      {form.source === 'Ad' && campaigns.length > 0 && (
        <Field label="Campaign" error={errors.campaign_id} highlight={hl('campaign_id')}>
          <Select
            value={form.campaign_id}
            onChange={set('campaign_id')}
            options={campaigns.map((c) => ({ value: String(c.id), label: c.name }))}
            error={errors.campaign_id}
            placeholder="Which ad?"
          />
        </Field>
      )}

      <Field label="Status" group highlight={hl('status')}>
        <ChoiceGroup ariaLabel="Status" options={options.statuses} value={form.status} onChange={set('status')} coloured />
      </Field>

      {form.status === 'Won' && (
        <Field label="Amount (₹)" error={errors.amount} highlight={hl('amount')}>
          <Input type="number" inputMode="decimal" min="0" value={form.amount} onChange={set('amount')} placeholder="0" error={errors.amount} />
        </Field>
      )}

      {form.status === 'Lost' && (
        <Field label="Why was it lost?" error={errors.lost_reason} highlight={hl('lost_reason')}>
          <Select value={form.lost_reason} onChange={set('lost_reason')} options={options.lostReasons} error={errors.lost_reason} />
        </Field>
      )}

      <Field
        label="Handled by"
        error={errors.handled_by}
        hint={options.staff.length ? undefined : 'Ask the agency to add staff names in Settings.'}
      >
        {options.staff.length ? (
          <Select value={form.handled_by} onChange={set('handled_by')} options={options.staff} error={errors.handled_by} />
        ) : (
          <Input value={form.handled_by} onChange={set('handled_by')} placeholder="Your name" error={errors.handled_by} />
        )}
      </Field>

      <Field label="Note" optional highlight={hl('note')}>
        <Input value={form.note} onChange={set('note')} maxLength={200} placeholder="Quantity, deadline…" />
      </Field>

      <ErrorNote>{formError}</ErrorNote>

      {isNew ? (
        // Fixed above the bottom bar on phones so Save is always in reach.
        <div className="above-nav fixed inset-x-0 z-20 border-t border-line bg-page/95 px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
          <div className="mx-auto max-w-xl">
            {repeat && <p className="mb-2 text-center text-sm text-warn">Choose an option above about the earlier lead.</p>}
            <Button type="submit" busy={busy} disabled={!!repeat} className="w-full">
              Save lead
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="submit" busy={busy} className="flex-1">
            Save changes
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}
