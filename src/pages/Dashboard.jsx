import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import { addDays, count, inr, inrShort, mondayOf, pct, presetRange, rangeLabel, shortDate, times, todayIST } from '../lib/format.js';
import { Card, ErrorNote, Input, Spinner, cx } from '../components/ui.jsx';
import WeeklySummary from '../components/WeeklySummary.jsx';

const PRESETS = [
  { key: 'week', label: 'This week' },
  { key: '4weeks', label: 'Last 4 weeks' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
];

function RangePicker({ preset, range, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key, p.key === 'custom' ? range : presetRange(p.key))}
            className={cx(
              'rounded-full border px-3 py-1.5 text-sm font-medium',
              preset === p.key ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-card text-muted',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && onChange('custom', { ...range, from: e.target.value })} aria-label="From" />
          <span className="text-muted">to</span>
          <Input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && onChange('custom', { ...range, to: e.target.value })} aria-label="To" />
        </div>
      )}
    </div>
  );
}

// ---- 1. Headline numbers ----

function Change({ now, before, lowerIsBetter }) {
  if (now === null || before === null || before === 0) return <span className="text-sm text-muted">No earlier data</span>;
  const change = now / before - 1;
  if (Math.abs(change) < 0.005) return <span className="text-sm text-muted">Same as before</span>;
  const good = lowerIsBetter ? change < 0 : change > 0;
  return (
    <span className={cx('num text-sm font-medium', good ? 'text-good' : 'text-bad')}>
      {change > 0 ? '▲' : '▼'} {pct(Math.abs(change))} <span className="font-normal text-muted">vs previous</span>
    </span>
  );
}

function Tiles({ now, before }) {
  const tiles = [
    { label: 'Ad spend', value: inr(now.spend), key: 'spend', neutral: true },
    { label: 'Leads', value: count(now.leads), key: 'leads' },
    { label: 'Sales', value: count(now.sales), key: 'sales' },
    { label: 'Revenue', value: inr(now.revenue), key: 'revenue' },
    { label: 'Return on ad spend', value: times(now.roas), key: 'roas' },
    { label: 'Cost per lead', value: inr(now.cpl), key: 'cpl', lowerIsBetter: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {tiles.map((t) => (
        <Card key={t.key}>
          <p className="text-sm text-muted">{t.label}</p>
          <p className="num mt-1 text-[28px] font-bold leading-tight">{t.value}</p>
          {t.neutral ? (
            <span className="num text-sm text-muted">{inr(before.spend)} before</span>
          ) : (
            <Change now={now[t.key]} before={before[t.key]} lowerIsBetter={t.lowerIsBetter} />
          )}
        </Card>
      ))}
    </div>
  );
}

// ---- 3. Diagnosis ----

const LEVELS = {
  good: { edge: 'border-l-good', label: 'Looks healthy', text: 'text-good' },
  info: { edge: 'border-l-new', label: 'Waiting for data', text: 'text-new' },
  warning: { edge: 'border-l-warn', label: 'Needs attention', text: 'text-warn' },
  critical: { edge: 'border-l-bad', label: 'Main problem', text: 'text-bad' },
};

function Diagnosis({ diagnosis }) {
  const level = LEVELS[diagnosis.level];
  return (
    <Card className={cx('border-l-4', level.edge)}>
      <p className={cx('text-sm font-semibold', level.text)}>{level.label}</p>
      <p className="mt-1 text-[17px] leading-snug">{diagnosis.text}</p>
    </Card>
  );
}

// ---- 2. Funnel ----

function Funnel({ funnel }) {
  // Bars are scaled to conversations: clicks are usually 20x larger and would
  // shrink every later step to a sliver, so they are shown as a line above.
  const steps = [
    { label: 'Conversations started', value: funnel.conversations, note: 'Meta' },
    { label: 'Leads logged', value: funnel.leads, note: 'AVM' },
    { label: 'Quoted', value: funnel.quoted, note: 'AVM' },
    { label: 'Won', value: funnel.won, note: 'AVM' },
  ];
  const top = Math.max(...steps.map((s) => s.value), 1);
  return (
    <Card>
      <h2 className="font-semibold">Where leads drop off</h2>
      <p className="mb-4 text-sm text-muted">Ad leads only. Meta counts the first step, AVM logs the rest.</p>
      <p className="num mb-3 text-sm">
        <span className="font-semibold">{count(funnel.clicks)}</span> link clicks
        <span className="text-muted">
          {funnel.clicks > 0 ? ` → ${pct(funnel.conversations / funnel.clicks)} started a WhatsApp chat` : ''}
        </span>
      </p>
      <ol className="space-y-3">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : null;
          return (
            <li key={s.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span>
                  {s.label} <span className="text-muted">· {s.note}</span>
                </span>
                <span className="num">
                  <span className="font-semibold">{count(s.value)}</span>
                  {prev !== null && <span className="ml-2 text-muted">{prev > 0 ? `${pct(s.value / prev)} of above` : ''}</span>}
                </span>
              </div>
              <div className="h-3 rounded-full bg-page">
                <div
                  className="h-3 rounded-full bg-accent"
                  style={{ width: `${Math.min(100, Math.max((s.value / top) * 100, s.value > 0 ? 1.5 : 0))}%` }}
                  title={`${s.label}: ${count(s.value)}`}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---- 4. Trend ----

const REVENUE_COLOUR = '#2563EB';
const SPEND_COLOUR = '#6B7280';

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-sm shadow-sm">
      <p className="mb-1 font-medium">Week of {shortDate(label)}</p>
      <p className="num">
        <span className="mr-1.5 inline-block h-0.5 w-3 align-middle" style={{ background: REVENUE_COLOUR }} />
        Revenue {inr(row.revenue)}
      </p>
      <p className="num">
        <span className="mr-1.5 inline-block h-0.5 w-3 border-t-2 border-dashed align-middle" style={{ borderColor: SPEND_COLOUR }} />
        Spend {inr(row.spend)}
      </p>
    </div>
  );
}

function Trend({ rows }) {
  const hasData = rows.some((r) => r.spend > 0 || r.revenue > 0);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Weekly revenue and spend, last 12 weeks</h2>
        <div className="flex gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: REVENUE_COLOUR }} /> Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: SPEND_COLOUR }} /> Spend
          </span>
        </div>
      </div>
      {hasData ? (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#EEF0F2" />
              <XAxis dataKey="week_start" tickFormatter={shortDate} tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} minTickGap={16} />
              <YAxis tickFormatter={inrShort} tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#D1D5DB' }} />
              <Line type="linear" dataKey="revenue" stroke={REVENUE_COLOUR} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
              <Line type="linear" dataKey="spend" stroke={SPEND_COLOUR} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted">No spend or revenue in the last 12 weeks yet.</p>
      )}
    </Card>
  );
}

// ---- 5. Breakdowns ----

function Table({ title, note, columns, rows, empty }) {
  return (
    <Card flush className="overflow-hidden">
      <div className="px-4 pt-4">
        <h2 className="font-semibold">{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">{empty}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="num w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                {columns.map((c, i) => (
                  <th key={c.label} className={cx('px-4 py-2 font-medium', i > 0 && 'text-right')}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line last:border-0">
                  {columns.map((c, i) => (
                    <td key={c.label} className={cx('px-4 py-2.5', i === 0 ? 'font-medium' : 'text-right')}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function LostReasons({ rows }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const top = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Card>
      <h2 className="font-semibold">Why leads were lost</h2>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted">No lost leads in this period.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => (
            <li key={r.reason}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{r.reason}</span>
                <span className="num">
                  <span className="font-semibold">{r.count}</span> <span className="text-muted">({pct(r.count / total)})</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-page">
                <div className="h-2 rounded-full bg-bad/70" style={{ width: `${(r.count / top) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---- Page ----

export default function Dashboard() {
  const [preset, setPreset] = useState('4weeks');
  const [range, setRange] = useState(() => presetRange('4weeks'));
  const [includeOther, setIncludeOther] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    const q = new URLSearchParams({ from: range.from, to: range.to, all: includeOther ? '1' : '0' });
    api(`/dashboard?${q}`).then(
      (d) => !stale && (setData(d), setError(''), setLoading(false)),
      (err) => !stale && (setError(err.message), setLoading(false)),
    );
    return () => {
      stale = true;
    };
  }, [range.from, range.to, includeOther]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">
            {rangeLabel(range.from, range.to)}
            {data && ` · compared with ${rangeLabel(data.range.prevFrom, data.range.prevTo)}`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={includeOther} onChange={(e) => setIncludeOther(e.target.checked)} className="h-4 w-4 accent-accent" />
          Include non-ad leads
        </label>
      </div>

      <RangePicker
        preset={preset}
        range={range}
        onChange={(p, r) => {
          setPreset(p);
          setRange(r);
        }}
      />

      <ErrorNote>{error}</ErrorNote>
      {!data && loading ? (
        <Spinner />
      ) : data ? (
        <div className={cx('space-y-4 transition-opacity', loading && 'opacity-60')}>
          <Tiles now={data.headline} before={data.previous} />
          <Diagnosis diagnosis={data.diagnosis} />
          <div className="grid gap-4 md:grid-cols-2">
            <Funnel funnel={data.funnel} />
            <LostReasons rows={data.lostReasons} />
          </div>
          <Trend rows={data.trend} />
          <Table
            title="By campaign"
            note="Ad leads only."
            rows={data.byCampaign}
            empty="No campaign activity in this period. Add campaigns in Settings and weekly numbers in Ad data."
            columns={[
              { label: 'Campaign', render: (r) => r.name },
              { label: 'Spend', render: (r) => inr(r.spend) },
              { label: 'Leads', render: (r) => count(r.leads) },
              { label: 'Sales', render: (r) => count(r.sales) },
              { label: 'Revenue', render: (r) => inr(r.revenue) },
              { label: 'Per lead', render: (r) => inr(r.cpl) },
              { label: 'Return', render: (r) => times(r.roas) },
            ]}
          />
          <Table
            title="By salesperson"
            rows={data.bySalesperson}
            empty="No leads in this period."
            columns={[
              { label: 'Name', render: (r) => r.name },
              { label: 'Leads', render: (r) => count(r.leads) },
              { label: 'Won', render: (r) => pct(r.winShare) },
              { label: 'Revenue', render: (r) => inr(r.revenue) },
              {
                label: 'Waiting',
                render: (r) => <span className={r.waiting > 0 ? 'font-medium text-warn' : 'text-muted'}>{r.waiting}</span>,
              },
            ]}
          />
        </div>
      ) : null}

      <WeeklySummary defaultWeek={addDays(mondayOf(todayIST()), -7)} />
    </div>
  );
}
