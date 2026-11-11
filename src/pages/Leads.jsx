import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRightIcon, ListIcon, PlusIcon, SearchIcon, Table2Icon, UsersRoundIcon } from 'lucide-react';
import { api, storage } from '@/lib/api.js';
import LeadTable from '@/components/LeadTable.jsx';
import { aed, count, isWaiting, timeAgo } from '@/lib/format.js';
import { CHANNEL_DOT } from '@/lib/leadFields.js';
import { useSession } from '@/session.jsx';
import { ErrorAlert, LoadingBlock, PageHeader, StatusBadge } from '@/components/app.jsx';
import { Frame, FramePanel } from '@/components/reui/frame';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

const FILTERS = ['All', 'New', 'Quoted', 'Won', 'Lost', 'Follow up'];

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// Avatar tint cycles through AVM's CMYK by name, purely decorative.
const TINTS = ['bg-brand-cyan/15 text-info-foreground', 'bg-brand-magenta/12 text-[#9c0f5c]', 'bg-brand-yellow/35 text-[#6d6700]', 'bg-foreground/[0.07] text-foreground'];
const tint = (name) => TINTS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TINTS.length];

export function LeadRow({ lead, followupDays }) {
  const waiting = isWaiting(lead, followupDays);
  return (
    <Link
      to={`/leads/${lead.id}`}
      className={cn('group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 md:gap-4 md:px-5', lead.duplicate && 'opacity-55')}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold', tint(lead.customer_name))}>
        {initials(lead.customer_name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">{lead.customer_name}</p>
          {waiting && (
            <Badge variant="warning-light" radius="full" size="sm">
              Follow up
            </Badge>
          )}
          {lead.duplicate && (
            <Badge variant="outline" radius="full" size="sm">
              Duplicate
            </Badge>
          )}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {[lead.business_name, lead.service].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="hidden w-32 text-right md:block">
        <p className={cn('num text-sm', lead.status === 'Won' ? 'font-semibold' : 'text-muted-foreground')}>{lead.amount ? aed(lead.amount) : ''}</p>
        <p className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
          <span className={cn('size-1.5 rounded-full', CHANNEL_DOT[lead.channel])} />
          {lead.channel}
        </p>
      </div>
      <div className="flex w-[5.5rem] flex-col items-end gap-1">
        <StatusBadge status={lead.status} />
        <span className="text-xs text-muted-foreground">{timeAgo(lead.created_at)}</span>
      </div>
      <ChevronRightIcon className="hidden size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 md:block" />
    </Link>
  );
}

export default function Leads() {
  const { role, options } = useSession();
  const followupDays = options.followupDays;
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') ?? 'All';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [state, setState] = useState({ loading: true, leads: [], hasMore: false, error: '', totals: null });
  const [view, setViewState] = useState(() => storage.get('avm:leads-view') ?? 'table');
  const setView = (v) => {
    setViewState(v);
    storage.set('avm:leads-view', v);
  };
  // After an edit in the table, refresh just the totals (one row, same filters).
  async function refreshTotals() {
    try {
      const { totals } = await api(`/leads?${filterQuery({ limit: '1' })}`);
      setState((s) => ({ ...s, totals }));
    } catch {
      /* totals are a nicety */
    }
  }
  const created = (lead) => {
    setState((s) => ({ ...s, leads: [lead, ...s.leads] }));
    refreshTotals();
  };
  const updated = (lead) => {
    setState((s) => ({ ...s, leads: s.leads.map((l) => (l.id === lead.id ? lead : l)) }));
    refreshTotals();
  };

  // Debounce typing, then keep the search in the URL so Back returns to it.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (search) next.set('q', search);
      else next.delete('q');
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function filterQuery(extra) {
    const query = new URLSearchParams(extra);
    const q = params.get('q');
    if (q) query.set('q', q);
    if (filter === 'Follow up') {
      query.set('followup', '1');
      query.set('days', String(followupDays));
    } else if (filter !== 'All') query.set('status', filter);
    return query;
  }

  async function load(offset = 0) {
    const query = filterQuery({ limit: '30', offset: String(offset) });
    try {
      const data = await api(`/leads?${query}`);
      setState((s) => ({ loading: false, error: '', hasMore: data.hasMore, totals: data.totals, leads: offset ? [...s.leads, ...data.leads] : data.leads }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    load(0);
  }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickFilter(f) {
    const next = new URLSearchParams(params);
    if (!f || f === 'All') next.delete('filter');
    else next.set('filter', f);
    setParams(next, { replace: true });
  }

  const logPath = role === 'agency' ? '/log' : '/';
  const filtered = params.get('q') || filter !== 'All';

  return (
    <div>
      <PageHeader
        eyebrow="Pipeline"
        title="Leads"
        description="Newest first. Type straight into the table, or open a lead for more."
        action={
          <div className="flex items-center gap-2">
            <ToggleGroup value={[view]} onValueChange={(v) => v[0] && setView(v[0])} spacing={0} variant="outline" className="hidden md:flex" aria-label="View">
              <ToggleGroupItem value="table" className="h-10 gap-1.5 bg-card px-3 aria-pressed:bg-foreground aria-pressed:text-background">
                <Table2Icon /> Table
              </ToggleGroupItem>
              <ToggleGroupItem value="list" className="h-10 gap-1.5 bg-card px-3 aria-pressed:bg-foreground aria-pressed:text-background">
                <ListIcon /> List
              </ToggleGroupItem>
            </ToggleGroup>
            {role === 'agency' && (
              <Button className="h-10 rounded-xl px-4 md:hidden" nativeButton={false} render={<Link to="/log" />}>
                <PlusIcon data-icon="inline-start" /> Log lead
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 space-y-3">
        <InputGroup className="h-11 rounded-xl bg-card md:h-10">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, business or number" aria-label="Search leads" className="text-base md:text-sm" />
        </InputGroup>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <ToggleGroup value={[filter]} onValueChange={(v) => pickFilter(v[0])} spacing={2} aria-label="Filter leads">
            {FILTERS.map((f) => (
              <ToggleGroupItem
                key={f}
                value={f}
                variant="outline"
                className="h-9 shrink-0 rounded-full bg-card px-4 font-semibold aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
              >
                {f}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {state.totals && state.totals.leads > 0 && (
        <div className="mb-4 grid grid-cols-3 divide-x rounded-xl border bg-card">
          <div className="px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Business won</p>
            <p className="num font-display text-2xl text-success-foreground md:text-3xl">{aed(state.totals.won_value)}</p>
            <p className="text-xs text-muted-foreground">{count(state.totals.won)} won lead{state.totals.won === 1 ? '' : 's'}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Still in play</p>
            <p className="num font-display text-2xl md:text-3xl">{aed(state.totals.open_value)}</p>
            <p className="text-xs text-muted-foreground">New and quoted ticket value</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Leads</p>
            <p className="num font-display text-2xl md:text-3xl">{count(state.totals.leads)}</p>
            <p className="text-xs text-muted-foreground">{filtered ? 'Matching this filter' : 'All time'}</p>
          </div>
        </div>
      )}

      <ErrorAlert className="mb-4">{state.error}</ErrorAlert>

      {!state.loading && view === 'table' && (
        <div className="hidden md:block">
          <LeadTable
            leads={state.leads}
            onCreated={created}
            onUpdated={updated}
            followupDays={followupDays}
            hasMore={state.hasMore}
            onLoadMore={() => load(state.leads.length)}
          />
        </div>
      )}

      <div className={cn(view === 'table' && 'md:hidden')}>
      {state.loading ? (
        <LoadingBlock rows={5} />
      ) : state.leads.length === 0 ? (
        <Frame>
          <FramePanel>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersRoundIcon />
                </EmptyMedia>
                <EmptyTitle className="font-display text-2xl font-normal">{filtered ? 'No leads match' : 'No leads yet'}</EmptyTitle>
                <EmptyDescription>{filtered ? 'Try another search or filter.' : 'Log the first WhatsApp enquiry to get started.'}</EmptyDescription>
              </EmptyHeader>
              {!filtered && (
                <EmptyContent>
                  <Button className="h-10 rounded-xl" nativeButton={false} render={<Link to={logPath} />}>
                    <PlusIcon data-icon="inline-start" /> Log a lead
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          </FramePanel>
        </Frame>
      ) : (
        <Frame>
          <FramePanel className="divide-y p-0">
            {state.leads.map((lead) => (
              <LeadRow key={lead.id} lead={lead} followupDays={followupDays} />
            ))}
          </FramePanel>
          {state.hasMore && (
            <Button variant="ghost" className="h-10 w-full rounded-xl" onClick={() => load(state.leads.length)}>
              Show more
            </Button>
          )}
        </Frame>
      )}
      </div>
    </div>
  );
}
