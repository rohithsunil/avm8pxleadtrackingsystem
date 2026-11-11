import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CopyIcon, RefreshCwIcon, SaveIcon, SparklesIcon } from 'lucide-react';
import { api } from '@/lib/api.js';
import { addDays, mondayOf, rangeLabel, todayLocal } from '@/lib/format.js';
import { ErrorAlert, Section, useConfirm } from '@/components/app.jsx';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

// The last 8 weeks, newest first; the default is last full week.
function weekOptions() {
  const thisWeek = mondayOf(todayLocal());
  return Array.from({ length: 8 }, (_, i) => {
    const start = addDays(thisWeek, -7 * i);
    return { value: start, label: `${i === 0 ? 'This week' : i === 1 ? 'Last week' : 'Week of'} · ${rangeLabel(start, addDays(start, 6))}` };
  });
}

export default function WeeklySummary({ defaultWeek }) {
  const confirm = useConfirm();
  const [week, setWeek] = useState(defaultWeek);
  const [saved, setSaved] = useState(null); // text stored on the server
  const [text, setText] = useState('');
  const [state, setState] = useState({ loading: true, writing: false, saving: false, error: '' });

  useEffect(() => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    api(`/summary?week=${week}`).then(
      ({ summary }) => {
        setSaved(summary?.body ?? null);
        setText(summary?.body ?? '');
        setState((s) => ({ ...s, loading: false }));
      },
      (err) => setState((s) => ({ ...s, loading: false, error: err.message })),
    );
  }, [week]);

  async function write() {
    if (saved && text !== saved && !(await confirm({ title: 'Rewrite the summary?', description: 'This replaces your edits with a fresh draft.', confirmLabel: 'Rewrite' }))) return;
    setState((s) => ({ ...s, writing: true, error: '' }));
    try {
      const { summary } = await api('/summary', { method: 'POST', body: { week_start: week } });
      setSaved(summary.body);
      setText(summary.body);
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    } finally {
      setState((s) => ({ ...s, writing: false }));
    }
  }

  async function saveEdits() {
    setState((s) => ({ ...s, saving: true, error: '' }));
    try {
      const { summary } = await api('/summary', { method: 'PUT', body: { week_start: week, body: text } });
      setSaved(summary.body);
      toast.success('Summary saved');
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    } finally {
      setState((s) => ({ ...s, saving: false }));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied. Paste it into WhatsApp or email.');
    } catch {
      toast.error('Could not copy. Select the text instead.');
    }
  }

  const edited = saved !== null && text !== saved;

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-brand-magenta" /> Weekly note for AVM
        </span>
      }
      description="Written by Claude from the week’s totals. Edit, then copy."
      action={
        <NativeSelect value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Week" className="[&_select]:h-9 [&_select]:rounded-full [&_select]:bg-card [&_select]:font-medium">
          {weekOptions().map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>
              {o.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      }
    >
      {state.loading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : saved === null && !state.writing ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <p className="max-w-md font-display text-2xl leading-snug">A five-sentence note on the week, ready to send.</p>
          <Button onClick={write} className="h-11 rounded-xl px-5">
            <SparklesIcon data-icon="inline-start" /> Write summary
          </Button>
        </div>
      ) : state.writing ? (
        <div className="space-y-2.5 py-2" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Claude is writing…
          </p>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : (
        <div className="space-y-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} aria-label="Summary text" className="rounded-xl font-display text-xl leading-relaxed md:text-xl" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy} disabled={!text} className="h-10 rounded-xl">
              <CopyIcon data-icon="inline-start" /> Copy
            </Button>
            {edited && (
              <Button variant="outline" disabled={state.saving} onClick={saveEdits} className="h-10 rounded-xl">
                {state.saving ? <Spinner /> : <SaveIcon data-icon="inline-start" />} Save edits
              </Button>
            )}
            <Button variant="ghost" onClick={write} className="h-10 rounded-xl">
              <RefreshCwIcon data-icon="inline-start" /> Rewrite
            </Button>
          </div>
        </div>
      )}
      <ErrorAlert className="mt-3">{state.error}</ErrorAlert>
    </Section>
  );
}
