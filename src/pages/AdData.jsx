import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheetIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { api } from '@/lib/api.js';
import { count, money2, rangeLabel } from '@/lib/format.js';
import { ErrorAlert, LoadingBlock, PageHeader, Section, useConfirm } from '@/components/app.jsx';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Ad data = Meta Ads Manager's Campaigns export, kept exactly as Meta reports it.
export default function AdData() {
  const confirm = useConfirm();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    api('/ad-reports').then((d) => setReports(d.reports), (err) => setError(err.message));
  }, []);

  async function upload(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return setError('Choose the .csv file exported from Ads Manager.');
    setBusy(true);
    setError('');
    try {
      const csv = await file.text();
      const d = await api('/ad-reports/import', { method: 'POST', body: { csv } });
      setReports(d.reports);
      toast.success(
        `Imported ${d.imported} campaign${d.imported === 1 ? '' : 's'}` +
          (d.replaced ? `, replacing ${d.replaced} older report${d.replaced === 1 ? '' : 's'} for the same days` : '') +
          (d.skipped.length ? `. Skipped ${d.skipped.length} with no delivery` : ''),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(r) {
    if (!(await confirm({ title: `Remove ${r.campaign}?`, description: `Its figures for ${rangeLabel(r.period_start, r.period_end)} leave the dashboard.`, confirmLabel: 'Remove', destructive: true }))) return;
    try {
      setReports((await api(`/ad-reports/${r.id}`, { method: 'DELETE' })).reports);
      toast.success('Report removed');
    } catch (err) {
      setError(err.message);
    }
  }

  const total = (reports ?? []).reduce((a, r) => ({ spend: a.spend + r.spend, results: a.results + r.results }), { spend: 0, results: 0 });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="From Meta Ads Manager" title="Ad data" description="Upload the Campaigns export. Figures are kept exactly as Meta reports them." />

      <Section title="Upload a Meta report">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files?.[0]);
          }}
          className={cn('flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors', dragging ? 'border-brand-cyan bg-brand-cyan/5' : 'border-border')}
        >
          <FileSpreadsheetIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">Drop the CSV here, or choose the file</p>
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          <Button onClick={() => input.current?.click()} disabled={busy} className="h-10 rounded-xl px-5">
            {busy ? <Spinner /> : <UploadIcon data-icon="inline-start" />} {busy ? 'Importing…' : 'Choose CSV'}
          </Button>
          <ol className="mt-2 max-w-xl list-decimal space-y-1 pl-5 text-left text-sm text-muted-foreground">
            <li>In Ads Manager, open <span className="font-medium text-foreground">Campaigns</span> and pick the date range (for example Last 30 days).</li>
            <li>Keep <span className="font-medium text-foreground">Columns: Performance</span>, then <span className="font-medium text-foreground">Export → Export table data → .csv</span>.</li>
            <li>Upload it here. A newer export for the same days replaces the older one, so nothing is counted twice.</li>
          </ol>
        </div>
        <ErrorAlert className="mt-4">{error}</ErrorAlert>
      </Section>

      {!reports ? (
        !error && <LoadingBlock rows={2} />
      ) : (
        <Section
          title="Imported reports"
          description={reports.length ? `${reports.length} campaign report${reports.length === 1 ? '' : 's'} · AED ${money2(total.spend)} spent · ${count(total.results)} results` : undefined}
          flush
        >
          {reports.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No reports yet. Upload a Meta export above.</p>
          ) : (
            <Table className="num min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {['Campaign', 'Period', 'Results', 'Per result', 'Spend (AED)', 'Impressions', 'Reach', ''].map((h, i) => (
                    <TableHead key={h || i} className={cn('h-10 text-xs font-semibold tracking-wide text-muted-foreground uppercase', i === 0 ? 'pl-5' : i < 2 ? '' : 'text-right', i === 7 && 'w-12 pr-3')}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="py-3 pl-5 font-semibold">
                      <span className="inline-flex items-center gap-2">
                        {r.campaign}
                        {r.delivery && (
                          <Badge variant={r.delivery === 'active' ? 'success-light' : 'outline'} radius="full">
                            {r.delivery === 'active' ? 'Active' : 'Off'}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{rangeLabel(r.period_start, r.period_end)}</TableCell>
                    <TableCell className="text-right">
                      {count(r.results)} <span className="text-xs text-muted-foreground">{r.result_label.toLowerCase()}</span>
                    </TableCell>
                    <TableCell className="text-right">{r.results ? (r.spend / r.results).toFixed(2) : '–'}</TableCell>
                    <TableCell className="text-right font-semibold">{money2(r.spend)}</TableCell>
                    <TableCell className="text-right">{count(r.impressions)}</TableCell>
                    <TableCell className="text-right">{r.reach ? count(r.reach) : '–'}</TableCell>
                    <TableCell className="pr-3 text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => remove(r)} aria-label={`Remove ${r.campaign}`} className="text-muted-foreground hover:text-destructive">
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      )}
    </div>
  );
}
