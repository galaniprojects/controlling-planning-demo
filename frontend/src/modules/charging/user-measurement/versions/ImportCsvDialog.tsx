/**
 * CSV bulk-entry modal per FD-2 / [F-UM-03].
 *
 * Imports the CSV into a **draft** version — never activates. The controller
 * reviews the preview (parse_errors + skipped_zero_rows) and chooses whether
 * to discard the draft or proceed to Activate. This is the closure of the
 * FD-1 auto-activate shim.
 *
 * Header (informational): `year,quarter,s_code,charging_location_code,value[,source]`.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, FileSpreadsheet, Upload } from 'lucide-react';
import { userMeasurementApi } from '@/api/userMeasurement';
import type { UMCsvImportResponse } from '@/types/userMeasurement';

export interface ImportCsvDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import. The caller navigates to the new draft. */
  onImported: (result: UMCsvImportResponse) => void;
}

export function ImportCsvDialog({
  open, onClose, onImported,
}: ImportCsvDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UMCsvImportResponse | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setSubmitting(false);
      setError(null);
      setResult(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [open]);

  const onPickFile = () => inputRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Choose a CSV file to import.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await userMeasurementApi.importCsv(file);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    if (result) onImported(result);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import User Measurement CSV</DialogTitle>
          <DialogDescription>
            Creates a draft. Review, then Activate to freeze the version per{' '}
            <span className="font-mono">[F-UM-02]</span>. UM values are
            integer-only per <span className="font-mono">[F-UM-01]</span>;
            non-integer rows are rejected at the row level.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3">
            <Card className="bg-accent/40 dark:bg-accent/20 p-3 border-border space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Expected header
              </p>
              <p className="text-xs font-mono text-foreground break-all">
                year,quarter,s_code,charging_location_code,value[,source]
              </p>
            </Card>

            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFileChange}
            />

            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onPickFile} disabled={submitting}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Choose file…
              </Button>
              {file ? (
                <span className="text-sm text-foreground flex items-center gap-1.5">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
                  {file.name}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  No file selected.
                </span>
              )}
            </div>

            {error && (
              <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800 dark:text-red-300">
                  {error}
                </p>
              </Card>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Card className="border-emerald-500/60 bg-emerald-50 dark:bg-emerald-900/20 p-3">
              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                Draft v{result.version.id} created for {result.version.year}-Q
                {result.version.quarter}.
                <span className="block text-[11px] mt-1">
                  {result.preview.inserted} cell
                  {result.preview.inserted !== 1 ? 's' : ''} inserted ·{' '}
                  {result.preview.skipped_zero_rows} zero-value row
                  {result.preview.skipped_zero_rows !== 1 ? 's' : ''} skipped.
                  The draft is <strong>not yet active</strong> — review it,
                  then Activate.
                </span>
              </p>
            </Card>

            {result.preview.parse_errors.length > 0 && (
              <Card className="border-amber-500/60 bg-amber-50 dark:bg-amber-900/20 p-3">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                  Parse warnings ({result.preview.parse_errors.length}):
                </p>
                <ul className="list-disc ml-4 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
                  {result.preview.parse_errors.slice(0, 8).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {result.preview.parse_errors.length > 8 && (
                    <li>
                      … and {result.preview.parse_errors.length - 8} more
                    </li>
                  )}
                </ul>
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!file || submitting}>
                {submitting ? 'Importing…' : 'Import as draft'}
              </Button>
            </>
          ) : (
            <Button onClick={handleDone}>Open draft</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
