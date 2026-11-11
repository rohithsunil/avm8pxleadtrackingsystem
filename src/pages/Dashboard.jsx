import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ArrowDownRightIcon, ArrowUpRightIcon, CalendarIcon, MinusIcon } from 'lucide-react';
import { api } from '@/lib/api.js';
import { aed, aedShort, addDays, count, greeting, mondayOf, money, pct, presetRange, rangeLabel, shortDate, times, todayLocal, toIso } from '@/lib/format.js';
import { ErrorAlert, LoadingBlock, Section } from '@/components/app.jsx';
import { CmykBar } from '@/components/brand.jsx';
import WeeklySummary from '@/components/WeeklySummary.jsx';
import { Badge } from '@/components/reui/badge';
import { Frame, FramePanel } from '@/components/reui/frame';
import { DateSelector } from '@/components/reui/date-selector';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { CHANNEL_DOT } from '@/lib/leadFields.js';

// ---------- Range controls ----------

const PRESETS = [
  { key: 'week', label: 'This week' },
  { key: '4weeks', label: '4 weeks' },
  { key: 'month', label: 'This month' },
];

function CustomRange({ active, range, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState();

  useEffect(() => {
    if (open) {
      setDraft({
        period: 'day',
        operator: 'between',
        startDate: new Date(`${range.from}T12:00:00`),
        endDate: new Date(`${range.to}T12:00:00`),
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function apply() {
    if (draft?.startDate) {
      const from = toIso(draft.startDate);
      const to = draft.endDate ? toIso(draft.endDate) : from;
      onApply(from <= to ? { from, to } : { from: to, to: from });
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className={cn('h-9 rounded-full bg-card px-4 font-semibold', active && 'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background')}>
            <CalendarIcon data-icon="inline-start" />
            {active ? rangeLabel(range.from, range.to) : 'Custom'}
          </Button>
        }
      />
      <PopoverContent className="w-auto gap-0 p-0" align="end" sideOffset={6}>
        <div className="p-3">
          <DateSelector
            value={draft}
            onChange={setDraft}
            allowRange
            periodTypes={['day']}
            presetMode="between"
            defaultFilterType="between"
            showInput={false}
            weekStartsOn={1}
            maxYear={new Date().getFullYear()}
          />
        </div>
        <div className="flex justify-end gap-2 border-t p-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- Verdict: the diagnosis, as the page's headline ----------

const LEVEL = {
  good: { label: 'Healthy', dot: 'bg-[#3ccf8e]' },
  info: { label: 'Waiting for data', dot: 'bg-ink-muted' },
  warning: { label: 'Needs attention', dot: 'bg-brand-yellow' },
  critical: { label: 'Main problem', dot: 'bg-brand-magenta' },
};

const CHECK_HINT = {
  logging: 'Fix first: until every chat is logged, the rest of this page undercounts.',
  quality: 'Look at the ad audience and the creative’s promise.',
  followup: 'Ask the team to reply to new leads the same day.',
  pricing: 'Review quotes against competitors, or add a smaller starter offer.',
  adcost: 'Try a fresh creative or a new audience.',
  healthy: 'Keep the current ads running and watch cost per lead.',
  data: 'Log a few more leads and add this week’s ad numbers.',
};

function Verdict({ diagnosis }) {
  const level = LEVEL[diagnosis.level];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink text-ink-foreground">
      <CmykBar />
      <div className="px-5 py-6 md:px-8 md:py-8">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-ink-muted uppercase">
          <span className={cn('size-2 rounded-full', level.dot)} />
          {level.label}
        </div>
        <p className="max-w-3xl font-display text-[1.75rem] leading-[1.15] md:text-[2.4rem]">{diagnosis.text}</p>
        <p className="mt-4 text-sm text-ink-muted md:text-base">{CHECK_HINT[diagnosis.check]}</p>
      </div>
      <img src="/brand/avm-mark.svg" alt="" aria-hidden="true" className="pointer-events-none absolute -right-6 -bottom-16 hidden h-64 opacity-[0.08] md:block" />
    </div>
  );
}

// ---------- KPI tiles ----------

function Delta({ now, before, lowerIsBetter }) {
  if (now === null || before === null || before === 0) {
    return <span className="text-xs text-muted-foreground">No earlier data</span>;
  }
  const change = now / before - 1;
  if (Math.abs(change) < 0.005) {
    return (
      <Badge variant="outline" radius="full" size="lg" className="gap-1">
        <MinusIcon /> Same
      </Badge>
    );
  }
  const good = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <Badge variant={good ? 'success-light' : 'destructive-light'} radius="full" size="lg" className="num gap-0.5">
      <Icon /> {pct(Math.abs(change))}
    </Badge>
  );
}

function Tile({ label, value, unit, delta, foot }) {
  return (
    <FramePanel className="flex flex-col gap-3">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="num font-display text-[2.4rem] leading-none tracking-tight md:text-[2.75rem]">
        {unit && <span className="mr-1.5 align-top font-sans text-sm font-semibold tracking-normal text-muted-foreground">{unit}</span>}
        {value}
      </p>
      <div className="flex items-center gap-2">
        {delta}
        {foot && <span className="text-xs text-muted-foreground">{foot}</span>}
      </div>
    </FramePanel>
  );
}

function Tiles({ now, before }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Frame className="col-span-2 lg:col-span-1">
        <Tile label="Revenue from ads" unit="AED" value={money(now.revenue)} delta={<Delta now={now.revenue} before={before.revenue} />} foot="vs previous" />
      </Frame>
      <Frame>
        <Tile label="Return on ad spend" value={times(now.roas)} delta={<Delta now={now.roas} before={before.roas} />} foot="vs previous" />
      </Frame>
      <Frame>
        <Tile label="Ad spend" unit="AED" value={money(now.spend)} foot={`${aed(before.spend)} before`} />
      </Frame>
      <Frame>
        <Tile label="Leads" value={count(now.leads)} delta={<Delta now={now.leads} before={before.leads} />} />
      </Frame>
      <Frame>
        <Tile label="Sales" value={count(now.sales)} delta={<Delta now={now.sales} before={before.sales} />} />
      </Frame>
      <Frame className="col-span-2 lg:col-span-1">
        <Tile label="Cost per lead" unit="AED" value={money(now.cpl)} delta={<Delta now={now.cpl} before={before.cpl} lowerIsBetter />} foot="lower is better" />
      </Frame>
    </div>
  );
}

// ---------- Funnel ----------

function Funnel({ funnel, values }) {
  // Bars are scaled to conversations: clicks are usually 20x larger and would
  // shrink every later step to a sliver, so they are shown as a line above.
  const steps = [
    { label: 'Chats started', value: funnel.conversations, by: 'Meta' },
    { label: 'Leads logged', value: funnel.leads, by: 'AVM' },
    { label: 'Quoted', value: funnel.quoted, by: 'AVM' },
    { label: 'Won', value: funnel.won, by: 'AVM' },
  ];
  const top = Math.max(...steps.map((s) => s.value), 1);
  return (
    <Section title="Where leads drop off">
      <p className="num mb-5 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{count(funnel.clicks)}</span> link clicks
        {funnel.clicks > 0 && ` → ${pct(funnel.conversations / funnel.clicks)} opened a WhatsApp chat`}
      </p>
      <ol className="space-y-4">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : null;
          return (
            <li key={s.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {s.label} <span className="font-normal text-muted-foreground">· {s.by}</span>
                </span>
                <span className="num">
                  {prev !== null && prev > 0 && <span className="mr-2 text-xs text-muted-foreground">{pct(s.value / prev)} of above</span>}
                  <span className="font-display text-xl">{count(s.value)}</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted">
                <div
                  className={cn('h-2.5 rounded-full', i === steps.length - 1 ? 'bg-chart-1' : 'bg-foreground')}
                  style={{ width: `${Math.min(100, Math.max((s.value / top) * 100, s.value > 0 ? 1.5 : 0))}%` }}
                  title={`${s.label}: ${count(s.value)}`}
                />
              </div>
            </li>
          );
        })}
      </ol>
      {values.openCount > 0 && (
        <p className="num mt-5 border-t pt-4 text-sm text-muted-foreground">
          <span className="font-display text-xl text-foreground">{aed(values.open)}</span> still in play across {values.openCount} open lead{values.openCount === 1 ? '' : 's'}
          {values.openPriced < values.openCount && ` (${values.openCount - values.openPriced} without a ticket value)`}
        </p>
      )}
    </Section>
  );
}

function LostReasons({ rows, lostValue }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const top = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Section title="Why leads were lost" description={total ? `${total} lost in this period${lostValue > 0 ? ` · ${aed(lostValue)} in ticket value` : ''}` : undefined}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No lost leads in this period.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.reason}>
              <div className="mb-1.5 flex justify-between gap-2 text-sm">
                <span className="font-medium">{r.reason}</span>
                <span className="num">
                  <span className="mr-2 text-xs text-muted-foreground">{pct(r.count / total)}</span>
                  <span className="font-display text-xl">{r.count}</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted">
                <div className="h-2.5 rounded-full bg-destructive/70" style={{ width: `${(r.count / top) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- Trend ----------

const chartConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-1)' },
  spend: { label: 'Ad spend', color: 'var(--chart-2)' },
};

function Trend({ rows }) {
  const hasData = rows.some((r) => r.spend > 0 || r.revenue > 0);
  return (
    <Section
      title="Revenue against ad spend"
      description="Weekly, last 12 weeks, AED"
      action={
        <div className="flex shrink-0 items-center gap-4 text-xs font-medium whitespace-nowrap text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-chart-1" /> Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-chart-2" /> Ad spend
          </span>
        </div>
      }
    >
      {hasData ? (
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="week_start" tickFormatter={shortDate} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
            <YAxis tickFormatter={aedShort} tickLine={false} axisLine={false} width={44} />
            <ChartTooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={<ChartTooltipContent indicator="line" labelFormatter={(v) => `Week of ${shortDate(v)}`} formatter={(value, name) => (
                <div className="flex w-full justify-between gap-6">
                  <span className="text-muted-foreground">{chartConfig[name]?.label}</span>
                  <span className="num font-semibold">{aed(value)}</span>
                </div>
              )} />}
            />
            <Line type="linear" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2.25} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background)' }} />
            <Line type="linear" dataKey="spend" stroke="var(--color-spend)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background)' }} />
          </LineChart>
        </ChartContainer>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">No spend or revenue in the last 12 weeks yet.</p>
      )}
    </Section>
  );
}

// ---------- Breakdown tables ----------

function DataTable({ title, description, columns, rows, empty }) {
  return (
    <Section title={title} description={description} flush>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <Table className="num min-w-[520px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c, i) => (
                <TableHead key={c.label} className={cn('h-10 text-xs font-semibold tracking-wide text-muted-foreground uppercase', i === 0 ? 'pl-5' : 'text-right', i === columns.length - 1 && 'pr-5')}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, ri) => (
              <TableRow key={ri}>
                {columns.map((c, i) => (
                  <TableCell key={c.label} className={cn('py-3 text-[0.9rem]', i === 0 ? 'pl-5 font-semibold' : 'text-right', i === columns.length - 1 && 'pr-5')}>
                    {c.render(r)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

// ---------- Page ----------

export default function Dashboard() {
  const [preset, setPreset] = useState('4weeks');
  const [range, setRange] = useState(() => presetRange('4weeks'));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    const q = new URLSearchParams({ from: range.from, to: range.to, all: '1' });
    api(`/dashboard?${q}`).then(
      (d) => !stale && (setData(d), setError(''), setLoading(false)),
      (err) => !stale && (setError(err.message), setLoading(false)),
    );
    return () => {
      stale = true;
    };
  }, [range.from, range.to]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{greeting()}</p>
          <h1 className="font-display text-[2.5rem] leading-[1.05] md:text-5xl">
            What the ads <em>brought in</em>
          </h1>
          <p className="mt-2 text-[0.95rem] text-muted-foreground">
            {rangeLabel(range.from, range.to)}
            {data && <> · compared with {rangeLabel(data.range.prevFrom, data.range.prevTo)}</>}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              value={preset === 'custom' ? [] : [preset]}
              onValueChange={(v) => {
                if (!v[0]) return;
                setPreset(v[0]);
                setRange(presetRange(v[0]));
              }}
              spacing={2}
              aria-label="Date range"
            >
              {PRESETS.map((p) => (
                <ToggleGroupItem key={p.key} value={p.key} variant="outline" className="h-9 rounded-full bg-card px-4 font-semibold aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                  {p.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <CustomRange
              active={preset === 'custom'}
              range={range}
              onApply={(r) => {
                setPreset('custom');
                setRange(r);
              }}
            />
          </div>
        </div>
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      {!data && loading ? (
        <LoadingBlock rows={4} />
      ) : data ? (
        <div className={cn('space-y-6 transition-opacity', loading && 'opacity-60')}>
          <Verdict diagnosis={data.diagnosis} />
          <Tiles now={data.headline} before={data.previous} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Funnel funnel={data.funnel} values={data.values} />
            <LostReasons rows={data.lostReasons} lostValue={data.values.lost} />
          </div>
          <Trend rows={data.trend} />
          <DataTable
            title="By channel"
            rows={data.byChannel}
            empty="No leads in this period."
            columns={[
              {
                label: 'Channel',
                render: (r) => (
                  <span className="inline-flex items-center gap-2">
                    <span className={cn('size-2 rounded-full', CHANNEL_DOT[r.name])} />
                    {r.name}
                  </span>
                ),
              },
              { label: 'Leads', render: (r) => count(r.leads) },
              { label: 'Sales', render: (r) => count(r.sales) },
              { label: 'Won', render: (r) => pct(r.winShare) },
              { label: 'Revenue', render: (r) => money(r.revenue) },
            ]}
          />
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <DataTable
              title="By campaign"
              rows={data.byCampaign}
              empty="No campaign activity yet. Add campaigns in Settings and weekly numbers in Ad data."
              columns={[
                { label: 'Campaign', render: (r) => r.name },
                { label: 'Spend', render: (r) => money(r.spend) },
                { label: 'Leads', render: (r) => count(r.leads) },
                { label: 'Sales', render: (r) => count(r.sales) },
                { label: 'Revenue', render: (r) => money(r.revenue) },
                { label: 'Per lead', render: (r) => money(r.cpl) },
                {
                  label: 'Return',
                  render: (r) => (
                    <Badge variant={r.roas === null ? 'outline' : r.roas >= 2 ? 'success-light' : r.roas >= 1 ? 'warning-light' : 'destructive-light'} radius="full" size="lg">
                      {times(r.roas)}
                    </Badge>
                  ),
                },
              ]}
            />
            <DataTable
              title="By salesperson"
              rows={data.bySalesperson}
              empty="No leads in this period."
              columns={[
                { label: 'Name', render: (r) => r.name },
                { label: 'Leads', render: (r) => count(r.leads) },
                { label: 'Won', render: (r) => pct(r.winShare) },
                { label: 'Revenue', render: (r) => money(r.revenue) },
                {
                  label: 'Waiting',
                  render: (r) =>
                    r.waiting > 0 ? (
                      <Badge variant="warning-light" radius="full" size="lg">
                        {r.waiting}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    ),
                },
              ]}
            />
          </div>
        </div>
      ) : null}

      <WeeklySummary defaultWeek={addDays(mondayOf(todayLocal()), -7)} />
    </div>
  );
}
