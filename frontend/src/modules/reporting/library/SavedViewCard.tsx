import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { SavedViewItem } from '@/types/api';

const REPORT_NAMES: Record<string, string> = {
  'programme-rollup': 'Programme / Multi-Project Rollup',
  'cc-financial-summary': 'Cost Center Financial Summary',
  'vendor-spend': 'Vendor Spend Analysis',
  'forecast-accuracy': 'Forecast Accuracy',
  'year-over-year': 'Year-over-Year Comparison',
};

interface SavedViewCardProps {
  view: SavedViewItem;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}

export function SavedViewCard({ view, onRename, onDelete }: SavedViewCardProps) {
  const navigate = useNavigate();
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(view.name);

  const reportName = REPORT_NAMES[view.report_id] ?? view.report_id;
  const modified = new Date(view.modified_at).toLocaleDateString('de-DE');

  const handleRename = () => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== view.name) {
      onRename(view.id, trimmed);
    }
    setRenameOpen(false);
  };

  return (
    <>
      <div
        className="group rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all relative"
        onClick={() => navigate(`/reporting/${view.report_id}?view=${view.id}`)}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground truncate">{view.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{reportName}</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">Modified: {modified}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setNewName(view.name);
                  setRenameOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 dark:text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(view.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Rename View</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRename} disabled={!newName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
