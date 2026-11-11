import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { addDays, inr, mondayOf, rangeLabel, todayIST } from '../lib/format.js';
import { Button, Card, Empty, ErrorNote, PageTitle, Spinner, cx, useToast } from '../components/ui.jsx';

const FIELDS = [
  { key: 'spend', label: 'Spend (₹)', decimal: true },
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Link clicks' },
  { key: 'conversations', label: 'Conversations' },
];

const cellClass =
  'num w-full min-h-11 rounded-lg border border-line bg-card px-2 text-right text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

export default function AdData() {
  const toast = useToast();
  const [week, setWeek] = useState(() => addDays(mondayOf(todayIST()), -7)); // last full week
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
    if (data.exists && !window.confirm(`Numbers for ${rangeLabel(week, addDays(week, 6))} are already saved. Replace them?`)) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        week_start: week,
        rows: rows.map((r) => ({
          campaign_id: r.campaign_id,
          ...Object.fromEntries(FIELDS.map((f) => [f.key, Number(r[f.key] || 0)])),
        })),
      };
      const d = await api('/ad-stats', { method: 'PUT', body });
      setData(d);
      toast('Week saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const totalSpend = rows.reduce((s, r) => s + Number(r.spend || 0), 0);

  return (
    <div className="space-y-4">
      <PageTitle>Ad data</PageTitle>
      <p className="-mt-2 text-sm text-muted">
        Once a week, copy these numbers per campaign from Meta Ads Manager. Use the "WhatsApp conversations started" result for
        Conversations.
      </p>

      <div className="flex items-center gap-2">
        <Button variant="secondary" className="min-h-10 px-3" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
          ←
        </Button>
        <div className="flex-1 text-center">
          <p className="font-medium">{rangeLabel(week, addDays(week, 6))}</p>
          {data && <p className={cx('text-sm', data.exists ? 'text-good' : 'text-muted')}>{data.exists ? 'Saved' : 'Not entered yet'}</p>}
        </div>
        <Button
          variant="secondary"
          className="min-h-10 px-3"
          onClick={() => setWeek(addDays(week, 7))}
          disabled={week >= mondayOf(todayIST())}
          aria-label="Next week"
        >
          →
        </Button>
      </div>

      <ErrorNote>{error}</ErrorNote>
      {!data ? (
        !error && <Spinner />
      ) : rows.length === 0 ? (
        <Card>
          <Empty
            text="No active campaigns. Add one in Settings first."
            action={
              <Link to="/settings" className="rounded-[10px] bg-accent px-4 py-2.5 font-medium text-white">
                Go to Settings
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {rows.map((r, i) => (
              <Card key={r.campaign_id}>
                <p className="mb-3 font-medium">
                  {r.name}
                  {!r.active && <span className="ml-2 text-sm font-normal text-muted">(inactive)</span>}
                </p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="block">
                      <span className="mb-1 block text-sm text-muted">{f.label}</span>
                      <input
                        type="number"
                        min="0"
                        step={f.decimal ? '0.01' : '1'}
                        inputMode={f.decimal ? 'decimal' : 'numeric'}
                        value={r[f.key]}
                        placeholder="0"
                        onChange={(e) => setCell(i, f.key, e.target.value)}
                        className={cellClass}
                      />
                    </label>
                  ))}
                </div>
              </Card>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="num text-sm text-muted">Total spend {inr(totalSpend)}</span>
            <Button busy={busy} onClick={save}>
              Save week
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
