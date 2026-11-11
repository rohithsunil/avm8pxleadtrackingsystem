import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, CircleDashedIcon, MegaphoneIcon } from 'lucide-react';
import { api } from '@/lib/api.js';
import { aed, addDays, mondayOf, rangeLabel, todayLocal } from '@/lib/format.js';
import { ErrorAlert, LoadingBlock, PageHeader, Section, useConfirm } from '@/components/app.jsx';
import { Badge } from '@/components/reui/badge';
import { Frame, FramePanel } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

const FIELDS = [
  { key: 'spend', label: 'Amount spent', money: true },
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Link clicks' },
  { key: 'conversations', label: 'Chats started' },
];

export default function AdData() {
  const confirm = useConfirm();
  const [week, setWeek] = useState(() => addDays(mondayOf(todayLocal()), -7)); // last full week
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(null);
    setError('');
    api(`/ad-stats?week=${week}`).then(
      (d) => {
        setData(d);
        setRows(d.rows.map((r) => ({ ...r, ...Object.fromEntries(FIELDS.map((f) => [f.key, r.saved ? String(r[f.key]) : ''])) })));
      },
      (err) => setError(err.message),
    );
  }, [week]);

  const setCell = (i, key, value) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  async function save() {
    if (
      data.exists &&
      !(await confirm({ title: 'Replace saved numbers?', description: `Numbers for ${rangeLabel(week, addDays(week, 6))} are already saved.`, confirmLabel: 'Replace' }))
    )
      return;
    setBusy(true);
    setError('');
    try {
      const body = {
        week_start: week,
        rows: rows.map((r) => ({ campaign_id: r.campaign_id, ...Object.fromEntries(FIELDS.map((f) => [f.key, Number(r[f.key] || 0)])) })),
      };
      setData(await api('/ad-stats', { method: 'PUT', body }));
      toast.success('Week saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const totalSpend = rows.reduce((s, r) => s + Number(r.spend || 0), 0);
  const isCurrentWeek = week >= mondayOf(todayLocal());

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Weekly, from Meta Ads Manager" title="Ad data" description="Four numbers per campaign. Use the ‘Messaging conversations started’ result for chats." />

      <Frame>
        <FramePanel className="flex items-center gap-3 py-3">
          <Button variant="outline" size="icon-lg" className="rounded-xl" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
            <ChevronLeftIcon />
          </Button>
          <div className="flex-1 text-center">
            <p className="font-display text-2xl leading-tight">{rangeLabel(week, addDays(week, 6))}</p>
            {data && (
              <Badge variant={data.exists ? 'success-light' : 'outline'} radius="full" size="lg" className="mt-1 gap-1">
                {data.exists ? <CheckCircle2Icon /> : <CircleDashedIcon />}
                {data.exists ? 'Saved' : 'Not entered yet'}
              </Badge>
            )}
          </div>
          <Button variant="outline" size="icon-lg" className="rounded-xl" onClick={() => setWeek(addDays(week, 7))} disabled={isCurrentWeek} aria-label="Next week">
            <ChevronRightIcon />
          </Button>
        </FramePanel>
      </Frame>

      <ErrorAlert>{error}</ErrorAlert>

      {!data ? (
        !error && <LoadingBlock rows={2} />
      ) : rows.length === 0 ? (
        <Frame>
          <FramePanel>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MegaphoneIcon />
                </EmptyMedia>
                <EmptyTitle className="font-display text-2xl font-normal">No active campaigns</EmptyTitle>
                <EmptyDescription>Add the ads you're running in Settings first.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button className="h-10 rounded-xl" nativeButton={false} render={<Link to="/settings" />}>
                  Go to Settings
                </Button>
              </EmptyContent>
            </Empty>
          </FramePanel>
        </Frame>
      ) : (
        <>
          <div className="space-y-4">
            {rows.map((r, i) => (
              <Section
                key={r.campaign_id}
                title={r.name}
                action={
                  !r.active && (
                    <Badge variant="outline" radius="full">
                      Ended
                    </Badge>
                  )
                }
              >
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {FIELDS.map((f) => {
                    const id = `campaign-${r.campaign_id}-${f.key}`;
                    const props = {
                      id,
                      type: 'number',
                      min: '0',
                      step: f.money ? '0.01' : '1',
                      inputMode: f.money ? 'decimal' : 'numeric',
                      value: r[f.key],
                      placeholder: '0',
                      onChange: (e) => setCell(i, f.key, e.target.value),
                    };
                    return (
                      <Field key={f.key}>
                        <FieldLabel htmlFor={id} className="text-muted-foreground">
                          {f.label}
                        </FieldLabel>
                        {f.money ? (
                          <InputGroup className="h-11 rounded-xl md:h-10">
                            <InputGroupAddon>
                              <InputGroupText className="text-xs font-semibold">AED</InputGroupText>
                            </InputGroupAddon>
                            <InputGroupInput {...props} className="num text-right text-base md:text-sm" />
                          </InputGroup>
                        ) : (
                          <Input {...props} className="num h-11 rounded-xl text-right text-base md:h-10 md:text-sm" />
                        )}
                      </Field>
                    );
                  })}
                </div>
              </Section>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Total spend <span className="num ml-1 font-display text-2xl text-foreground">{aed(totalSpend)}</span>
            </p>
            <Button disabled={busy} onClick={save} className="h-11 rounded-xl px-6">
              {busy && <Spinner />} Save week
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
