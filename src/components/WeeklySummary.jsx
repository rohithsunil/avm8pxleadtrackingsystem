import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { addDays, mondayOf, rangeLabel, todayIST } from '../lib/format.js';
import { Button, Card, ErrorNote, Select, cx, inputClass, useToast } from './ui.jsx';

// The last 8 weeks, newest first; the default is last full week.
function weekOptions() {
  const thisWeek = mondayOf(todayIST());
  return Array.from({ length: 8 }, (_, i) => {
    const start = addDays(thisWeek, -7 * i);
    return { value: start, label: `${i === 0 ? 'This week' : i === 1 ? 'Last week' : 'Week'} · ${rangeLabel(start, addDays(start, 6))}` };
  });
}

export default function WeeklySummary({ defaultWeek }) {
  const toast = useToast();
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
    if (saved && text !== saved && !window.confirm('Rewrite replaces your edits. Continue?')) return;
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
      toast('Summary saved');
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    } finally {
      setState((s) => ({ ...s, saving: false }));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast('Could not copy. Select the text instead.');
    }
  }

  const edited = saved !== null && text !== saved;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Weekly summary</h2>
          <p className="text-sm text-muted">A short note for AVM, written by Claude from this week's totals.</p>
        </div>
        <Select value={week} onChange={(e) => setWeek(e.target.value)} options={weekOptions()} placeholder="Pick a week" className="w-auto min-h-10 text-sm" aria-label="Week" />
      </div>

      {state.loading ? null : saved === null && !state.writing ? (
        <Button onClick={write} className="w-full md:w-auto">
          Write summary
        </Button>
      ) : (
        <>
          <textarea
            value={state.writing ? 'Writing…' : text}
            onChange={(e) => setText(e.target.value)}
            disabled={state.writing}
            rows={6}
            className={cx(inputClass, 'py-3 leading-relaxed', state.writing && 'text-muted')}
            aria-label="Summary text"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy} disabled={state.writing || !text}>
              Copy
            </Button>
            {edited && (
              <Button variant="secondary" busy={state.saving} onClick={saveEdits}>
                Save edits
              </Button>
            )}
            <Button variant="ghost" busy={state.writing} onClick={write}>
              Rewrite
            </Button>
          </div>
        </>
      )}
      <ErrorNote>{state.error}</ErrorNote>
    </Card>
  );
}
