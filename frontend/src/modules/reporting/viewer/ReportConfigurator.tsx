import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ColumnDef } from './ReportViewer';

interface ReportConfiguratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableColumns: ColumnDef[];
  visibleColumns: string[];
  onVisibleColumnsChange: (cols: string[]) => void;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSortChange?: (col: string, dir: 'asc' | 'desc') => void;
}

export function ReportConfigurator({
  open,
  onOpenChange,
  availableColumns,
  visibleColumns,
  onVisibleColumnsChange,
  sortColumn,
  sortDirection,
  onSortChange,
}: ReportConfiguratorProps) {
  const toggleColumn = (key: string) => {
    if (visibleColumns.includes(key)) {
      // Don't allow hiding all columns
      if (visibleColumns.length > 1) {
        onVisibleColumnsChange(visibleColumns.filter((c) => c !== key));
      }
    } else {
      onVisibleColumnsChange([...visibleColumns, key]);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[340px] sm:w-[380px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Customize Report</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Column visibility */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">Visible Columns</h3>
            <div className="space-y-2">
              {availableColumns.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2.5 cursor-pointer rounded px-2 py-1.5 hover:bg-slate-50"
                >
                  <Checkbox
                    checked={visibleColumns.includes(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  />
                  <span className="text-sm text-slate-600">{col.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sort order */}
          {onSortChange && (
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-3">Sort Order</h3>
              <div className="space-y-2">
                <Select
                  value={sortColumn || '__none__'}
                  onValueChange={(v) => onSortChange(v === '__none__' ? '' : v, sortDirection)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sort by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {availableColumns.map((col) => (
                      <SelectItem key={col.key} value={col.key}>
                        {col.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sortDirection}
                  onValueChange={(v) =>
                    onSortChange(sortColumn, v as 'asc' | 'desc')
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
