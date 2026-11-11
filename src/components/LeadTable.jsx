import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUpRightIcon, CheckIcon, ClipboardPasteIcon, CornerDownLeftIcon, PlusIcon, SparklesIcon, XIcon } from 'lucide-react';
import { api, storage } from '@/lib/api.js';
import { phoneDisplay, shortDate } from '@/lib/format.js';
import { adValue, CHANNEL_DOT, fromAdValue } from '@/lib/leadFields.js';
import { useSession } from '@/session.jsx';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/*
 * Spreadsheet-style lead entry.
 * - The tinted row(s) at the top are new leads: type across with Tab, Enter saves.
 * - Paste rows copied from Excel or Google Sheets into a new-row cell to add many at once.
 * - Every cell of an existing lead is editable; changes save when you leave the cell.
 */

const HANDLER_KEY = 'avm:handled_by';

const STATUS_TEXT = {
  New: 'text-foreground',
  Quoted: 'text-warning-foreground',
  Won: 'text-success-foreground',
  Lost: 'text-destructive-foreground',
};

function useColumns() {
  const { options } = useSession();
  return useMemo(
    () => [
      { key: 'customer_name', label: 'Customer', width: 180, type: 'text', required: true, placeholder: 'Name', sticky: true },
      { key: 'phone', label: 'Number', width: 150, type: 'text', required: true, placeholder: '050 123 4567', inputMode: 'tel' },
      { key: 'amount', label: 'Ticket value (AED)', width: 150, type: 'money', placeholder: 'Add price' },
      { key: 'status', label: 'Status', width: 110, type: 'select', options: options.statuses.map((s) => ({ value: s, label: s })) },
      { key: 'channel', label: 'Channel', width: 130, type: 'select', options: options.channels.map((c) => ({ value: c, label: c })) },
      { key: 'service', label: 'Service', width: 180, type: 'text', required: true, placeholder: 'e.g. Business cards', list: 'table-service-suggestions' },
      options.staff.length
        ? { key: 'handled_by', label: 'Handled by', width: 140, type: 'select', required: true, blank: 'Choose…', options: options.staff.map((s) => ({ value: s, label: s })) }
        : { key: 'handled_by', label: 'Handled by', width: 140, type: 'text', required: true, placeholder: 'Name' },
      { key: 'business_name', label: 'Business', width: 170, type: 'text', placeholder: 'Optional' },
      {
        key: 'lost_reason', label: 'Lost because', width: 170, type: 'select', blank: 'Choose…',
        options: options.lostReasons.map((s) => ({ value: s, label: s })), when: (r) => r.status === 'Lost',
      },
      { key: 'note', label: 'Note', width: 220, type: 'text', placeholder: 'Quantity, deadline…' },
    ],
    [options],
  );
}

// ---- row <-> API ----

function toRow(lead) {
  return {
    ...lead,
    phone: lead.phone ? phoneDisplay(lead.phone) : '',
    ad: adValue(lead),
    amount: lead.amount ? String(lead.amount) : '',
    lost_reason: lead.lost_reason ?? '',
    business_name: lead.business_name ?? '',
    note: lead.note ?? '',
  };
}

function payload(row, keys) {
  const out = {};
  for (const k of keys) {
    if (k === 'ad') Object.assign(out, fromAdValue(row.ad));
    else if (k === 'amount') out.amount = row.amount === '' ? null : Number(String(row.amount).replace(/[^\d.]/g, ''));
    else if (k === 'lost_reason') out.lost_reason = row.lost_reason || null;
    else out[k] = row[k];
  }
  // Won/Lost need their companion value in the same request.
  if (keys.includes('status') || keys.includes('amount')) out.amount ??= row.amount === '' ? null : Number(row.amount);
  if (keys.includes('status') || keys.includes('lost_reason')) out.lost_reason ??= row.lost_reason || null;
  return out;
}

function errorsFor(fields = {}) {
  const e = { ...fields };
  if (e.campaign_id) e.ad = e.campaign_id;
  return e;
}

let draftSeq = 0;
function blankDraft(options) {
  return {
    _key: `d${++draftSeq}`,
    customer_name: '', business_name: '', phone: '', service: '',
    channel: 'WhatsApp',
    // Not shown in the table: every lead counts as from the ads, and Claude
    // links a campaign when it spots that ad's pre-filled message.
    ad: 'ad',
    status: 'New', amount: '', lost_reason: '',
    handled_by: storage.get(HANDLER_KEY) ?? '',
    note: '',
  };
}

const isBlank = (d) => !d.customer_name && !d.phone && !d.business_name && !d.note && !d.service;

// Map pasted spreadsheet text onto columns, starting at the column it was pasted into.
function parsePaste(text, startIndex, columns, options, template) {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return lines.map((line) => {
    const cells = line.split('\t');
    const row = { ...template, _key: `d${++draftSeq}` };
    cells.forEach((raw, i) => {
      const col = columns[startIndex + i];
      const value = raw.trim();
      if (!col || !value) return;
      if (col.type === 'select') {
        const match = col.options.find((o) => o.label.toLowerCase() === value.toLowerCase() || o.value.toLowerCase() === value.toLowerCase());
        if (match) row[col.key] = match.value;
        else if (col.key === 'handled_by') row.handled_by = value;
      } else if (col.type === 'money') {
        row.amount = value.replace(/[^\d.]/g, '');
      } else {
        row[col.key] = value;
      }
    });
    return row;
  });
}

// ---- cells ----

const cellBase =
  'h-10 w-full min-w-0 border-0 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground/50 focus:bg-card focus:ring-2 focus:ring-brand-cyan focus:ring-inset disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-transparent';

function Cell({ col, row, rowIndex, colIndex, onChange, onCommit, onKeyDown, onPaste, error, disabled, stickyBg }) {
  const common = {
    'data-row': rowIndex,
    'data-col': colIndex,
    'aria-label': col.label,
    'aria-invalid': !!error,
    disabled,
    onKeyDown,
    className: cn(cellBase, error && 'bg-destructive/5 ring-2 ring-destructive/60 ring-inset'),
  };
  const field =
    col.type === 'select' ? (
      <select
        {...common}
        value={row[col.key] ?? ''}
        onChange={(e) => {
          onChange(col.key, e.target.value);
          onCommit(col.key, e.target.value);
        }}
        className={cn(common.className, 'cursor-pointer appearance-none pr-6', col.key === 'status' && cn('font-semibold', STATUS_TEXT[row.status]))}
      >
        {col.blank && <option value="">{col.blank}</option>}
        {col.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {/* Keep a value that is no longer on the list visible. */}
        {row[col.key] && !col.options.some((o) => o.value === row[col.key]) && <option value={row[col.key]}>{row[col.key]}</option>}
      </select>
    ) : (
      <input
        {...common}
        type="text"
        inputMode={col.type === 'money' ? 'decimal' : col.inputMode}
        placeholder={disabled || !row._key ? '' : col.placeholder}
        value={row[col.key] ?? ''}
        onChange={(e) => onChange(col.key, e.target.value)}
        onBlur={() => onCommit(col.key)}
        onPaste={onPaste}
        list={col.list}
        autoComplete="off"
        className={cn(common.className, col.type === 'money' && cn('num text-right', row.status === 'Won' && row.amount && 'font-semibold text-success-foreground'))}
      />
    );
  const dot = col.key === 'channel' && CHANNEL_DOT[row.channel];
  return (
    <td
      className={cn('relative border-r border-b p-0 last:border-r-0', col.sticky && cn('sticky left-24 z-[1] shadow-[1px_0_0_var(--border)]', stickyBg))}
      style={{ width: col.width, minWidth: col.width }}
    >
      {dot && <span className={cn('pointer-events-none absolute top-1/2 left-2.5 size-2 -translate-y-1/2 rounded-full', dot)} />}
      {error ? (
        <Tooltip>
          <TooltipTrigger render={<div />}>{field}</TooltipTrigger>
          <TooltipContent>{error}</TooltipContent>
        </Tooltip>
      ) : (
        <div className={cn(dot && '[&>*]:pl-6')}>{field}</div>
      )}
    </td>
  );
}

// ---- paste a message: Claude fills the new row ----

function PasteBar({ onFill }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function fill(e) {
    e.preventDefault();
    if (text.trim().length < 3) return;
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const { fields } = await api('/parse', { method: 'POST', body: { text }, signal: controller.signal });
      if (!Object.keys(fields).length) toast.error('Nothing to fill from that text.');
      else {
        onFill(fields);
        setText('');
        toast.success('New row filled. Check it, then press Enter.');
      }
    } catch (err) {
      toast.error(err.name === 'AbortError' ? 'That took too long. Type it in instead.' : err.message);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={fill} className="flex items-center gap-2 rounded-xl bg-ink p-1.5 pl-3 text-ink-foreground">
      <SparklesIcon className="size-4 shrink-0 text-brand-yellow" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a customer's message and Claude fills the new row…"
        aria-label="Paste a message to fill the new row"
        className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
      />
      <Button type="submit" size="sm" disabled={busy || text.trim().length < 3} className="h-9 rounded-lg bg-ink-foreground px-3 text-ink hover:bg-white">
        {busy ? <Spinner /> : 'Fill row'}
      </Button>
    </form>
  );
}

// ---- table ----

export default function LeadTable({ leads, onCreated, onUpdated, followupDays, hasMore, onLoadMore }) {
  const { options } = useSession();
  const columns = useColumns();
  const [drafts, setDrafts] = useState(() => [blankDraft(options)]);
  const [draftState, setDraftState] = useState({}); // _key -> { saving, errors }
  const [rows, setRows] = useState(() => leads.map(toRow));
  const [rowState, setRowState] = useState({}); // id -> { saving, saved, errors }
  const dirty = useRef({}); // id -> Set of changed keys
  const tableRef = useRef(null);
  // Commits run after React re-renders, so they read rows from here, not a stale closure.
  const latestRows = useRef(rows);
  latestRows.current = rows;

  // Take in fresh server data, but keep rows that have unsaved edits.
  useEffect(() => {
    setRows((current) => {
      const byId = Object.fromEntries(current.map((r) => [r.id, r]));
      return leads.map((l) => (dirty.current[l.id]?.size ? byId[l.id] ?? toRow(l) : toRow(l)));
    });
  }, [leads]);

  const draftCount = drafts.filter((d) => !isBlank(d)).length;

  function focusCell(row, col) {
    requestAnimationFrame(() => tableRef.current?.querySelector(`[data-row="${row}"][data-col="${col}"]`)?.focus());
  }

  // Arrow keys move between rows like a spreadsheet; Enter saves a new row or moves down.
  function keyNav(e, rowIndex, colIndex, isDraft, draftKey) {
    const el = e.target;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isDraft) saveDraft(draftKey);
      else {
        el.blur();
        focusCell(rowIndex + 1, colIndex);
      }
    } else if (e.key === 'ArrowDown' && el.tagName === 'INPUT') {
      e.preventDefault();
      focusCell(rowIndex + 1, colIndex);
    } else if (e.key === 'ArrowUp' && el.tagName === 'INPUT') {
      e.preventDefault();
      focusCell(rowIndex - 1, colIndex);
    } else if (e.key === 'Escape' && isDraft) {
      el.blur();
    }
  }

  // ---- new rows ----

  function changeDraft(key, field, value) {
    setDrafts((ds) => ds.map((d) => (d._key === key ? { ...d, [field]: value } : d)));
    setDraftState((s) => {
      const errs = { ...(s[key]?.errors ?? {}) };
      delete errs[field];
      return { ...s, [key]: { ...s[key], errors: errs } };
    });
    if (field === 'handled_by' && value) storage.set(HANDLER_KEY, value);
  }

  async function saveDraft(key) {
    const draft = drafts.find((d) => d._key === key);
    if (!draft || isBlank(draft) || draftState[key]?.saving) return false;
    setDraftState((s) => ({ ...s, [key]: { saving: true, errors: {} } }));
    try {
      const lead = await api('/leads', {
        method: 'POST',
        body: payload(draft, ['customer_name', 'business_name', 'phone', 'service', 'channel', 'ad', 'status', 'amount', 'lost_reason', 'handled_by', 'note']),
      });
      onCreated(lead);
      setDrafts((ds) => {
        const rest = ds.filter((d) => d._key !== key);
        // Keep one blank row ready, carrying over channel / ad / who is logging.
        return rest.some(isBlank) ? rest : [{ ...blankDraft(options), channel: draft.channel }, ...rest];
      });
      setDraftState((s) => ({ ...s, [key]: undefined }));
      focusCell(0, 0);
      return true;
    } catch (err) {
      setDraftState((s) => ({ ...s, [key]: { saving: false, errors: errorsFor(err.fields) } }));
      if (!err.fields) toast.error(err.message);
      return false;
    }
  }

  async function saveAllDrafts() {
    let saved = 0;
    for (const d of drafts.filter((x) => !isBlank(x))) if (await saveDraft(d._key)) saved++;
    const failed = draftCount - saved;
    if (saved) toast.success(`${saved} lead${saved === 1 ? '' : 's'} saved`);
    if (failed) toast.error(`${failed} row${failed === 1 ? ' needs' : 's need'} fixing; hover the red cells.`);
  }

  function handlePaste(e, draftKey, colIndex) {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.trim().includes('\n')) return; // a plain single value: normal paste
    e.preventDefault();
    const target = drafts.find((d) => d._key === draftKey);
    const template = { ...blankDraft(options), channel: target.channel, handled_by: target.handled_by };
    const pasted = parsePaste(text, colIndex, columns, options, template);
    setDrafts((ds) => {
      const i = ds.findIndex((d) => d._key === draftKey);
      const merged = isBlank(ds[i]) ? [...pasted] : [ds[i], ...pasted];
      return [...ds.slice(0, i), ...merged, ...ds.slice(i + 1)];
    });
    toast.success(`${pasted.length} row${pasted.length === 1 ? '' : 's'} pasted. Check them, then Save all.`);
  }

  // ---- existing rows ----

  function changeRow(id, field, value) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    (dirty.current[id] ??= new Set()).add(field);
  }

  async function commitRow(id) {
    const keys = [...(dirty.current[id] ?? [])];
    if (!keys.length) return;
    const row = latestRows.current.find((r) => r.id === id);
    if (!row) return;
    // A status of Won/Lost waits for its value before saving.
    const pendingWon = row.status === 'Won' && !(Number(row.amount) > 0);
    const pendingLost = row.status === 'Lost' && !row.lost_reason;
    if ((pendingWon || pendingLost) && (keys.includes('status') || keys.includes('amount') || keys.includes('lost_reason'))) {
      setRowState((s) => ({ ...s, [id]: { errors: pendingWon ? { amount: 'Enter the ticket value to save' } : { lost_reason: 'Pick a reason to save' } } }));
      return;
    }
    dirty.current[id] = new Set();
    setRowState((s) => ({ ...s, [id]: { saving: true } }));
    try {
      const lead = await api(`/leads/${id}`, { method: 'PATCH', body: payload(row, keys) });
      onUpdated(lead);
      setRowState((s) => ({ ...s, [id]: { saved: true } }));
      setTimeout(() => setRowState((s) => (s[id]?.saved ? { ...s, [id]: undefined } : s)), 1500);
    } catch (err) {
      keys.forEach((k) => dirty.current[id].add(k));
      setRowState((s) => ({ ...s, [id]: { errors: errorsFor(err.fields), message: err.message } }));
      if (!err.fields) toast.error(err.message);
    }
  }

  // Commit after state has updated (selects commit on change).
  const commitSoon = (id) => setTimeout(() => commitRow(id), 0);

  // Put Claude's fields into the first new row.
  function fillFromMessage(fields) {
    const target = drafts.find(isBlank) ?? drafts[0];
    const patch = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'campaign_id') patch.ad = `c:${v}`;
      else if (k === 'phone') patch.phone = phoneDisplay(v);
      else if (k === 'amount') patch.amount = String(v);
      else if (k !== 'source') patch[k] = v;
    }
    setDrafts((ds) => ds.map((d) => (d._key === target._key ? { ...d, ...patch } : d)));
    focusCell(drafts.indexOf(target), 0);
  }

  return (
    <div className="space-y-3">
      <PasteBar onFill={fillFromMessage} />
      <datalist id="table-service-suggestions">
        {options.services.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border bg-card px-1.5 py-0.5 font-sans">Tab</kbd> next cell
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border bg-card px-1.5 py-0.5 font-sans">Enter</kbd> save new row
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ClipboardPasteIcon className="size-3.5" /> Paste rows from Excel or Sheets into the new row
          </span>
        </p>
        {draftCount > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDrafts([blankDraft(options)])}>
              <XIcon data-icon="inline-start" /> Clear new rows
            </Button>
            <Button size="sm" onClick={saveAllDrafts}>
              <CheckIcon data-icon="inline-start" /> Save all {draftCount}
            </Button>
          </div>
        )}
      </div>

      <div ref={tableRef} className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-max min-w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-[2] w-24 min-w-24 border-r border-b bg-[#f4f3ef] px-3 py-2 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Logged</th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn('border-r border-b px-3 py-2 text-[0.7rem] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase last:border-r-0', c.sticky && 'sticky left-24 z-[2] bg-[#f4f3ef] shadow-[1px_0_0_var(--border)]')}
                  style={{ width: c.width, minWidth: c.width }}
                >
                  {c.label}
                  {c.required && <span className="text-brand-magenta"> *</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drafts.map((d, di) => {
              const st = draftState[d._key] ?? {};
              return (
                <tr key={d._key} className="bg-[#f3fafc]">
                  <td className="sticky left-0 z-[1] w-24 min-w-24 border-r border-b bg-[#f3fafc] px-2">
                    {st.saving ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Spinner className="size-3.5" /> Saving
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => saveDraft(d._key)}
                        disabled={isBlank(d)}
                        className="flex h-8 items-center gap-1.5 rounded-md px-1.5 text-xs font-semibold text-info-foreground enabled:hover:bg-brand-cyan/10 disabled:text-muted-foreground"
                        title="Save this row (Enter)"
                      >
                        {isBlank(d) ? <PlusIcon className="size-3.5" /> : <CornerDownLeftIcon className="size-3.5" />}
                        {isBlank(d) ? 'New' : 'Save'}
                      </button>
                    )}
                  </td>
                  {columns.map((c, ci) => (
                    <Cell
                      key={c.key}
                      col={c}
                      row={d}
                      rowIndex={di}
                      colIndex={ci}
                      disabled={c.when ? !c.when(d) : false}
                      error={st.errors?.[c.key]}
                      onChange={(field, value) => changeDraft(d._key, field, value)}
                      onCommit={() => {}}
                      onKeyDown={(e) => keyNav(e, di, ci, true, d._key)}
                      onPaste={(e) => handlePaste(e, d._key, ci)}
                      stickyBg="bg-[#f3fafc]"
                    />
                  ))}
                </tr>
              );
            })}
            {rows.map((r, ri) => {
              const st = rowState[r.id] ?? {};
              const rowIndex = drafts.length + ri;
              return (
                <tr key={r.id} className={cn('group bg-card hover:bg-[#faf9f6]', r.duplicate && 'opacity-55')}>
                  <td className="sticky left-0 z-[1] w-24 min-w-24 border-r border-b bg-card px-2 group-hover:bg-[#faf9f6]">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs whitespace-nowrap text-muted-foreground">{shortDate(r.created_at)}</span>
                      {st.saving ? (
                        <Spinner className="size-3.5 text-muted-foreground" />
                      ) : st.saved ? (
                        <CheckIcon className="size-3.5 text-success" />
                      ) : (
                        <Link to={`/leads/${r.id}`} className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus:opacity-100" aria-label={`Open ${r.customer_name}`}>
                          <ArrowUpRightIcon className="size-3.5" />
                        </Link>
                      )}
                    </div>
                  </td>
                  {columns.map((c, ci) => (
                    <Cell
                      key={c.key}
                      col={c}
                      row={r}
                      rowIndex={rowIndex}
                      colIndex={ci}
                      disabled={c.when ? !c.when(r) : false}
                      error={st.errors?.[c.key]}
                      onChange={(field, value) => changeRow(r.id, field, value)}
                      onCommit={() => commitSoon(r.id)}
                      onKeyDown={(e) => keyNav(e, rowIndex, ci, false)}
                      stickyBg="bg-card group-hover:bg-[#faf9f6]"
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <Button variant="ghost" className="h-10 w-full rounded-xl" onClick={onLoadMore}>
          Show more
        </Button>
      )}
    </div>
  );
}
