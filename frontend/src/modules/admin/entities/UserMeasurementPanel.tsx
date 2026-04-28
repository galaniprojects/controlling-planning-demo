import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, RefreshCw, Info, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminD3Api } from '@/api/endpoints';
import type { UMCellItem, UMVersionItem, UMRefreshStatus, UMImportResult } from '@/types/api';
import { LocationLabel } from '../shared/LocationLabel';

const QUARTERS = [1, 2, 3, 4];

function fmtNumber(v: number): string {
  // European formatting per CLAUDE.md
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function UserMeasurementPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [year, setYear] = useState<number>(2026);
  const [quarter, setQuarter] = useState<number>(1);
  const [selectedImportedAt, setSelectedImportedAt] = useState<string>('latest');

  // Data
  const [versions, setVersions] = useState<UMVersionItem[]>([]);
  const [cells, setCells] = useState<UMCellItem[]>([]);
  const [refreshStatus, setRefreshStatus] = useState<UMRefreshStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
  const [importResult, setImportResult] = useState<UMImportResult | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [versionsRes, statusRes] = await Promise.all([
        adminD3Api.getUMVersions(),
        adminD3Api.getUMRefreshStatus(),
      ]);
      setVersions(versionsRes.items);
      setRefreshStatus(statusRes);

      // Pick imported_at to fetch
      const importedAt = selectedImportedAt === 'latest' ? undefined : selectedImportedAt;
      const cellsRes = await adminD3Api.getUMCells({ year, quarter, imported_at: importedAt });
      setCells(cellsRes.items);
    } catch {
      setVersions([]);
      setCells([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year, quarter, selectedImportedAt]);

  // Build pivot: rows = s_code, cols = charging_location_code
  const pivot = useMemo(() => {
    const sCodes = Array.from(new Set(cells.map((c) => c.s_code))).sort();
    const locCodes = Array.from(new Set(cells.map((c) => c.charging_location_code))).sort();
    const lookup = new Map<string, UMCellItem>();
    for (const c of cells) lookup.set(`${c.s_code}|${c.charging_location_code}`, c);

    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    let grand = 0;
    for (const c of cells) {
      rowTotals[c.s_code] = (rowTotals[c.s_code] ?? 0) + c.value;
      colTotals[c.charging_location_code] = (colTotals[c.charging_location_code] ?? 0) + c.value;
      grand += c.value;
    }
    return { sCodes, locCodes, lookup, rowTotals, colTotals, grand };
  }, [cells]);

  const handleCsvUpload = async (file: File) => {
    setImportingCsv(true);
    setImportError(null);
    setImportResult(null);
    try {
      const res = await adminD3Api.importUMCsv(file);
      setImportResult(res);
      fetchAll();
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImportingCsv(false);
    }
  };

  const onPickFile = () => fileInputRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleCsvUpload(f);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  const yearOptions = Array.from({ length: 5 }, (_, i) => 2024 + i);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">User Measurement Matrix</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sparse matrix of S-codes × <LocationLabel kind="charging" iconOnly /> charging locations
            from KB SAP. Read-only import (CSV upload or stubbed automatic refresh).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
          <Button variant="outline" size="sm" onClick={onPickFile} disabled={importingCsv}>
            <Upload className="h-4 w-4 mr-1.5" />
            {importingCsv ? 'Uploading…' : 'Upload CSV'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRefreshDialogOpen(true)}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Automatic refresh
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" /> Period
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[100px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
          <SelectTrigger className="w-[100px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {QUARTERS.map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-3">
          Version
        </div>
        <Select value={selectedImportedAt} onValueChange={setSelectedImportedAt}>
          <SelectTrigger className="w-[280px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Latest import</SelectItem>
            {versions.map((v) => (
              <SelectItem key={v.imported_at} value={v.imported_at}>
                {fmtDateTime(v.imported_at)} — {v.source} ({v.row_count} cells)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {cells.length} cells loaded · grand total {fmtNumber(pivot.grand)}
        </span>
      </div>

      {/* Refresh status banner */}
      {refreshStatus && refreshStatus.status === 'not_connected' && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>{refreshStatus.message}</span>
        </div>
      )}

      {/* Matrix */}
      {cells.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          No measurement cells for {year} Q{quarter} in the selected version. Try uploading a CSV
          or selecting a different period.
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-auto max-h-[60vh]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left font-medium text-muted-foreground sticky left-0 bg-card border-r border-border min-w-[140px]">
                  S-code \ Charging code
                </th>
                {pivot.locCodes.map((lc) => (
                  <th key={lc} className="px-2 py-2 text-right font-mono font-medium text-muted-foreground min-w-[90px] whitespace-nowrap">
                    {lc}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium text-foreground bg-muted border-l border-border min-w-[80px]">
                  Σ Row
                </th>
              </tr>
            </thead>
            <tbody>
              {pivot.sCodes.map((sc) => (
                <tr key={sc} className="border-b border-border hover:bg-accent/40">
                  <td className="px-2 py-1.5 font-mono font-medium text-foreground sticky left-0 bg-card border-r border-border">
                    {sc}
                  </td>
                  {pivot.locCodes.map((lc) => {
                    const cell = pivot.lookup.get(`${sc}|${lc}`);
                    if (!cell) {
                      return <td key={lc} className="px-2 py-1.5 text-right text-muted-foreground/40">·</td>;
                    }
                    return (
                      <td
                        key={lc}
                        className="px-2 py-1.5 text-right tabular-nums text-foreground"
                        title={`Imported ${fmtDateTime(cell.imported_at)} (${cell.source})`}
                      >
                        <span className="inline-block">{fmtNumber(cell.value)}</span>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-foreground bg-muted border-l border-border">
                    {fmtNumber(pivot.rowTotals[sc] ?? 0)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted">
                <td className="px-2 py-2 font-semibold text-foreground sticky left-0 bg-muted border-r border-border">Σ Column</td>
                {pivot.locCodes.map((lc) => (
                  <td key={lc} className="px-2 py-2 text-right tabular-nums font-semibold text-foreground">
                    {fmtNumber(pivot.colTotals[lc] ?? 0)}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums font-semibold text-foreground border-l border-border">
                  {fmtNumber(pivot.grand)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Cell badges legend */}
      <p className="text-[11px] text-muted-foreground">
        Hover any cell to see its <Badge variant="outline" className="text-[10px] px-1 py-0 mx-0.5">imported_at</Badge> badge.
        Numbers use European formatting.
      </p>

      {/* Refresh dialog (stubbed automatic refresh) */}
      <Dialog open={refreshDialogOpen} onOpenChange={setRefreshDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Automatic refresh</DialogTitle>
            <DialogDescription>
              {refreshStatus?.message ??
                'Automatic refresh from KB SAP is not available in this environment. ' +
                  'In production, this button would re-pull the latest user-measurement snapshot ' +
                  'directly from SAP. For now, please use the CSV upload above to ingest a new ' +
                  'version.'}
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Status:</strong> {refreshStatus?.status ?? 'unknown'}</p>
            {refreshStatus?.last_refresh && (
              <p><strong>Last refresh:</strong> {fmtDateTime(refreshStatus.last_refresh)}</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setRefreshDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import result dialog */}
      <Dialog open={!!importResult || !!importError} onOpenChange={() => { setImportResult(null); setImportError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{importError ? 'CSV import failed' : 'CSV import complete'}</DialogTitle>
          </DialogHeader>
          {importError && <p className="text-sm text-red-600">{importError}</p>}
          {importResult && (
            <div className="space-y-2 text-sm text-foreground">
              <p><strong>Inserted:</strong> {importResult.inserted} cells</p>
              <p><strong>Skipped (zero values):</strong> {importResult.skipped_zero}</p>
              <p><strong>Imported at:</strong> {fmtDateTime(importResult.imported_at)}</p>
              <p><strong>Source tag:</strong> {importResult.source}</p>
              {importResult.parse_errors.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
                  <p className="font-medium mb-1">Parse warnings ({importResult.parse_errors.length}):</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    {importResult.parse_errors.slice(0, 5).map((err, i) => (
                      <li key={i}>Row {err.row}: {err.message}</li>
                    ))}
                    {importResult.parse_errors.length > 5 && (
                      <li>… and {importResult.parse_errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setImportResult(null); setImportError(null); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
