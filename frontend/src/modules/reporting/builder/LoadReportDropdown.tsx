import { useEffect, useState } from 'react';
import { FolderOpen, Trash2, FilePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { reportBuilderApi } from '@/api/endpoints';
import type { SavedReportSummary } from '@/types/reportBuilder';

interface LoadReportDropdownProps {
  currentReportId: number | null;
  onLoad: (reportId: number) => void;
  onNew: () => void;
}

export function LoadReportDropdown({ currentReportId, onLoad, onNew }: LoadReportDropdownProps) {
  const [reports, setReports] = useState<SavedReportSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedReportSummary | null>(null);

  // Refresh list when dropdown opens
  useEffect(() => {
    if (open) {
      reportBuilderApi.listSaved().then((r) => setReports(r.items)).catch(() => {});
    }
  }, [open]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await reportBuilderApi.deleteSaved(deleteTarget.id);
      setReports((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      if (deleteTarget.id === currentReportId) {
        onNew(); // reset if currently loaded report was deleted
      }
    } catch {
      // silent fail for demo
    }
    setDeleteTarget(null);
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Load</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Load saved report</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onClick={onNew} className="gap-2">
            <FilePlus className="h-4 w-4" />
            New Report
          </DropdownMenuItem>
          {reports.length > 0 && <DropdownMenuSeparator />}
          {reports.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No saved reports yet
            </div>
          )}
          {reports.map((r) => (
            <DropdownMenuItem
              key={r.id}
              className="flex items-center justify-between group"
              onSelect={(e) => {
                e.preventDefault();
                onLoad(r.id);
                setOpen(false);
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate font-medium">
                  {r.name}
                  {r.id === currentReportId && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">(current)</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Modified {formatDate(r.modified_at)}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(r);
                }}
                className="ml-2 p-1 rounded hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Report</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete &ldquo;{deleteTarget?.name}&rdquo;? This cannot be undone.
            {deleteTarget && ' If shared, it will be removed for all recipients.'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
