import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { isWaiting, timeAgo } from '../lib/format.js';
import { useSession } from '../session.jsx';
import { Empty, ErrorNote, Input, PageTitle, Spinner, StatusChip, cx } from '../components/ui.jsx';

const FILTERS = ['All', 'New', 'Quoted', 'Won', 'Lost', 'Follow up'];

export function LeadCard({ lead, followupDays }) {
  return (
    <Link
      to={`/leads/${lead.id}`}
      className={cx('block rounded-xl border border-line bg-card p-4 hover:border-accent/40', lead.duplicate && 'opacity-60')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{lead.customer_name}</p>
          {lead.business_name && <p className="truncate text-sm text-muted">{lead.business_name}</p>}
        </div>
        <StatusChip status={lead.status} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span>{lead.service}</span>
        <span aria-hidden="true">·</span>
        <span>{timeAgo(lead.created_at)}</span>
        {lead.duplicate && <span className="rounded-full bg-line px-2 py-0.5 text-xs font-medium text-muted">Duplicate</span>}
        {isWaiting(lead, followupDays) && (
          <span className="rounded-full bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn">Follow up</span>
        )}
      </div>
    </Link>
  );
}

export default function Leads() {
  const { role, options } = useSession();
  const followupDays = options.followupDays;
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') ?? 'All';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [state, setState] = useState({ loading: true, leads: [], hasMore: false, error: '' });

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

  async function load(offset = 0) {
    const query = new URLSearchParams({ limit: '30', offset: String(offset) });
    const q = params.get('q');
    if (q) query.set('q', q);
    if (filter === 'Follow up') {
      query.set('followup', '1');
      query.set('days', String(followupDays));
    } else if (filter !== 'All') query.set('status', filter);
    try {
      const data = await api(`/leads?${query}`);
      setState((s) => ({
        loading: false,
        error: '',
        hasMore: data.hasMore,
        leads: offset ? [...s.leads, ...data.leads] : data.leads,
      }));
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
    if (f === 'All') next.delete('filter');
    else next.set('filter', f);
    setParams(next, { replace: true });
  }

  return (
    <div>
      <PageTitle
        action={
          role === 'agency' && (
            <Link to="/log" className="rounded-[10px] bg-accent px-3 py-2 text-sm font-medium text-white">
              Log lead
            </Link>
          )
        }
      >
        Leads
      </PageTitle>

      <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone" aria-label="Search leads" />

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => pickFilter(f)}
            className={cx(
              'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium',
              filter === f ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-card text-muted',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <ErrorNote>{state.error}</ErrorNote>
        {state.loading ? (
          <Spinner />
        ) : state.leads.length === 0 ? (
          <Empty
            text={params.get('q') || filter !== 'All' ? 'No leads match.' : 'No leads yet. Log your first one.'}
            action={
              !params.get('q') && filter === 'All' && (
                <Link to={role === 'agency' ? '/log' : '/'} className="rounded-[10px] bg-accent px-4 py-2.5 font-medium text-white">
                  Log a lead
                </Link>
              )
            }
          />
        ) : (
          state.leads.map((lead) => <LeadCard key={lead.id} lead={lead} followupDays={followupDays} />)
        )}
        {state.hasMore && !state.loading && (
          <button type="button" onClick={() => load(state.leads.length)} className="w-full py-3 text-sm font-medium text-accent">
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
