import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { inr, isWaiting, timeAgo } from '../lib/format.js';
import { useSession } from '../session.jsx';
import LeadForm from '../components/LeadForm.jsx';
import { Button, Card, ChoiceGroup, ErrorNote, Field, Input, Select, Spinner, StatusChip, useToast } from '../components/ui.jsx';

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

// Big status buttons: New/Quoted save at once, Won/Lost ask for one more detail.
function StatusUpdate({ lead, onSaved }) {
  const { options } = useSession();
  const toast = useToast();
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
      toast(`Marked as ${status}`);
    } catch (err) {
      setError(err.fields?.amount || err.fields?.lost_reason || err.message);
    } finally {
      setBusy(false);
    }
  }

  function pick(status) {
    setError('');
    // Re-picking Won or Lost lets staff correct the amount or reason.
    if (status === lead.status && !pending && status !== 'Won' && status !== 'Lost') return;
    if (status === 'Won') {
      setAmount(lead.amount ? String(lead.amount) : '');
      return setPending('Won');
    }
    if (status === 'Lost') {
      setReason(lead.lost_reason ?? '');
      return setPending('Lost');
    }
    save(status);
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm font-medium">Update status</p>
      <ChoiceGroup ariaLabel="Status" options={options.statuses} value={pending ?? lead.status} onChange={pick} coloured />
      {pending === 'Won' && (
        <div className="flex items-end gap-2">
          <Field label="Amount (₹)" className="flex-1">
            <Input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </Field>
          <Button busy={busy} onClick={() => save('Won', { amount: amount === '' ? null : Number(amount) })}>
            Save
          </Button>
        </div>
      )}
      {pending === 'Lost' && (
        <div className="flex items-end gap-2">
          <Field label="Why was it lost?" className="flex-1">
            <Select value={reason} onChange={(e) => setReason(e.target.value)} options={options.lostReasons} />
          </Field>
          <Button busy={busy} onClick={() => save('Lost', { lost_reason: reason || null })}>
            Save
          </Button>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Card>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const { options } = useSession();
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api(`/leads/${id}`).then(setLead, (err) => setError(err.message));
  }, [id]);

  async function setDuplicate(duplicate) {
    if (duplicate && !window.confirm('Mark this lead as a duplicate? It will be left out of all counts.')) return;
    try {
      setLead(await api(`/leads/${id}`, { method: 'PATCH', body: { duplicate } }));
      toast(duplicate ? 'Marked as duplicate' : 'Duplicate mark removed');
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !lead) return <ErrorNote>{error}</ErrorNote>;
  if (!lead) return <Spinner />;

  const phone = lead.phone.length === 10 ? `91${lead.phone}` : lead.phone;

  return (
    <div className="space-y-4">
      <Link to="/leads" className="inline-block text-sm font-medium text-accent">
        ← All leads
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{lead.customer_name}</h1>
          {lead.business_name && <p className="text-muted">{lead.business_name}</p>}
        </div>
        <StatusChip status={lead.status} />
      </div>

      {lead.duplicate && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-line/60 px-3 py-2 text-sm">
          <span>Marked as a duplicate and left out of all counts.</span>
          <button type="button" className="font-medium text-accent" onClick={() => setDuplicate(false)}>
            Undo
          </button>
        </div>
      )}
      {isWaiting(lead, options.followupDays) && (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">Still New after {timeAgo(lead.created_at).replace(' ago', '')}. Follow up.</p>
      )}

      {editing ? (
        <Card>
          <LeadForm
            lead={lead}
            onSaved={(updated) => {
              setLead(updated);
              setEditing(false);
              toast('Changes saved');
            }}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : (
        <>
          <StatusUpdate lead={lead} onSaved={setLead} />

          <div className="flex gap-2">
            <a href={`tel:+${phone}`} className="flex min-h-12 flex-1 items-center justify-center rounded-[10px] border border-line bg-card font-medium">
              Call
            </a>
            <a
              href={`https://wa.me/${phone}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 flex-1 items-center justify-center rounded-[10px] border border-line bg-card font-medium"
            >
              WhatsApp
            </a>
          </div>

          <Card className="py-1.5">
            <Row label="Phone">{lead.phone}</Row>
            <Row label="Service">{lead.service}</Row>
            <Row label="Source">{lead.source === 'Ad' ? lead.campaign_name || 'Ad' : 'Other'}</Row>
            {lead.status === 'Won' && <Row label="Amount">{inr(lead.amount)}</Row>}
            {lead.status === 'Lost' && <Row label="Lost because">{lead.lost_reason}</Row>}
            <Row label="Handled by">{lead.handled_by}</Row>
            {lead.note && <Row label="Note">{lead.note}</Row>}
            <Row label="Logged">{timeAgo(lead.created_at)}</Row>
          </Card>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Edit details
            </Button>
            {!lead.duplicate && (
              <Button variant="danger" onClick={() => setDuplicate(true)} className="text-sm">
                Mark as duplicate
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
