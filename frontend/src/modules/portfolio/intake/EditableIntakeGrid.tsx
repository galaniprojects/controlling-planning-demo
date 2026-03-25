import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/shared/Skeleton';
import { useCollapsibleYears } from '@/hooks/useCollapsibleYears';
import { portfolioApi } from '@/api/endpoints';
import { formatCurrencyDetailed, formatNumber } from '@/lib/formatters';
import { Trash2 } from 'lucide-react';

interface GridRow {
  id: string;
  name: string;
  category: string;
  sub_category: string;
  unit: string;
  months: { month: string; value: number; value_eur: number }[];
  total: number;
  total_eur: number;
}

interface EditLine {
  id: string;
  name: string;
  category: string;
  sub_category: string;
  unit: string;
  rate: number;
  monthValues: Record<string, number>; // month -> value (hours or eur)
  deleted: boolean;
}

interface Props {
  projectId: string;
  onConfirm: (comments: string, changes: Array<{
    category: string; sub_category: string; month: string;
    hours: number | null; amount_eur: number;
  }>) => Promise<void>;
  onCancel: () => void;
}

function monthLabel(month: string): string {
  const [, m] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[parseInt(m, 10) - 1] || m;
}

export function EditableIntakeGrid({ projectId, onConfirm, onCancel }: Props) {
  const [loading, setLoading] = useState(true);
  const [allMonths, setAllMonths] = useState<string[]>([]);
  const [originalRows, setOriginalRows] = useState<GridRow[]>([]);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { yearGroups, toggleYear, visibleColumns } = useCollapsibleYears(allMonths);

  useEffect(() => {
    portfolioApi
      .getEditableGrid(projectId)
      .then((res) => {
        setAllMonths(res.months);
        setOriginalRows(res.rows);

        const editLines: EditLine[] = res.rows.map((row) => {
          const monthValues: Record<string, number> = {};
          // Compute rate from first non-zero month
          let rate = 1;
          for (const mv of row.months) {
            monthValues[mv.month] = mv.value;
            if (row.category === 'internal' && mv.value > 0 && mv.value_eur > 0) {
              rate = mv.value_eur / mv.value;
            }
          }
          return {
            id: row.id,
            name: row.name,
            category: row.category,
            sub_category: row.sub_category,
            unit: row.unit,
            rate,
            monthValues,
            deleted: false,
          };
        });
        setLines(editLines);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  const setCellValue = useCallback((lineId: string, month: string, value: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, monthValues: { ...l.monthValues, [month]: value } }
          : l
      )
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, deleted: true } : l))
    );
  }, []);

  const getLineTotal = (line: EditLine) =>
    Object.values(line.monthValues).reduce((sum, v) => sum + v, 0);

  const getLineTotalEur = (line: EditLine) =>
    line.category === 'internal'
      ? getLineTotal(line) * line.rate
      : getLineTotal(line);

  const getYearTotal = (line: EditLine, months: string[]) =>
    months.reduce((sum, m) => sum + (line.monthValues[m] || 0), 0);

  // Detect changes: compare current lines to original rows
  const hasChanges = () => {
    for (const line of lines) {
      if (line.deleted) return true;
      const orig = originalRows.find((r) => r.id === line.id);
      if (!orig) continue;
      for (const m of allMonths) {
        const origVal = orig.months.find((mv) => mv.month === m)?.value || 0;
        if ((line.monthValues[m] || 0) !== origVal) return true;
      }
    }
    return false;
  };

  // Check if a cell value differs from original
  const isChanged = (lineId: string, month: string, value: number): boolean => {
    const orig = originalRows.find((r) => r.id === lineId);
    if (!orig) return false;
    const origVal = orig.months.find((mv) => mv.month === month)?.value || 0;
    return value !== origVal;
  };

  const handleConfirm = async () => {
    if (!feedback.trim()) return;
    setSubmitting(true);

    // Build changes array from edited lines
    const changes: Array<{
      category: string; sub_category: string; month: string;
      hours: number | null; amount_eur: number;
    }> = [];

    for (const line of lines) {
      for (const m of allMonths) {
        const currentVal = line.monthValues[m] || 0;
        const orig = originalRows.find((r) => r.id === line.id);
        const origVal = orig?.months.find((mv) => mv.month === m)?.value || 0;

        if (currentVal !== origVal || line.deleted) {
          const finalVal = line.deleted ? 0 : currentVal;
          changes.push({
            category: line.category,
            sub_category: line.sub_category,
            month: m,
            hours: line.category === 'internal' ? finalVal : null,
            amount_eur: line.category === 'internal' ? finalVal * line.rate : finalVal,
          });
        }
      }
    }

    try {
      await onConfirm(feedback.trim(), changes);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  const activeLines = lines.filter((l) => !l.deleted);
  const internalLines = activeLines.filter((l) => l.category === 'internal');
  const externalLines = activeLines.filter((l) => l.category === 'external');
  const grandTotalEur = activeLines.reduce((sum, l) => sum + getLineTotalEur(l), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm font-medium text-amber-800">Edit Resource Plan</p>
        <p className="text-xs text-amber-700 mt-1">
          Adjust the values below. Changed cells are highlighted. When done, add your feedback and confirm.
        </p>
      </div>

      {/* Grid */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5 text-left text-xs font-medium text-slate-500 w-[200px] min-w-[200px]">
                  Line Item
                </th>
                {yearGroups.map((yg) => (
                  <th
                    key={yg.year}
                    colSpan={yg.isExpanded ? yg.months.length : 1}
                    className="px-2 py-1.5 text-center text-xs font-medium text-slate-500 cursor-pointer hover:bg-slate-100"
                    onClick={() => toggleYear(yg.year)}
                  >
                    {yg.year} {yg.isExpanded ? '\u25B4' : '\u25BE'}
                  </th>
                ))}
                <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-500 w-[100px]">
                  Total
                </th>
                <th className="w-[40px]" />
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-1 text-left text-xs text-slate-400">
                  Unit
                </th>
                {visibleColumns.map((col) =>
                  col.type === 'month' ? (
                    <th key={col.key} className="px-2 py-1 text-center text-xs text-slate-400 min-w-[70px]">
                      {monthLabel(col.key)}
                    </th>
                  ) : (
                    <th key={`ys-${col.year}`} className="px-2 py-1 text-center text-xs text-slate-400 min-w-[70px]">
                      Sum
                    </th>
                  )
                )}
                <th className="px-3 py-1 text-right text-xs text-slate-400">EUR</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {/* INTERNAL RESOURCES */}
              {internalLines.length > 0 && (
                <tr className="bg-blue-50">
                  <td colSpan={visibleColumns.length + 3} className="px-3 py-1.5 text-xs font-semibold text-blue-800 uppercase tracking-wide">
                    Internal Resources (hours)
                  </td>
                </tr>
              )}
              {internalLines.map((line) => (
                <EditRow
                  key={line.id}
                  line={line}
                  visibleColumns={visibleColumns}
                  editingCell={editingCell}
                  onEditStart={setEditingCell}
                  onCellChange={setCellValue}
                  onRemove={removeLine}
                  getLineTotal={getLineTotal}
                  getLineTotalEur={getLineTotalEur}
                  getYearTotal={getYearTotal}
                  isChanged={isChanged}
                />
              ))}

              {/* EXTERNAL COSTS */}
              {externalLines.length > 0 && (
                <tr className="bg-emerald-50">
                  <td colSpan={visibleColumns.length + 3} className="px-3 py-1.5 text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                    External Costs (EUR)
                  </td>
                </tr>
              )}
              {externalLines.map((line) => (
                <EditRow
                  key={line.id}
                  line={line}
                  visibleColumns={visibleColumns}
                  editingCell={editingCell}
                  onEditStart={setEditingCell}
                  onCellChange={setCellValue}
                  onRemove={removeLine}
                  getLineTotal={getLineTotal}
                  getLineTotalEur={getLineTotalEur}
                  getYearTotal={getYearTotal}
                  isChanged={isChanged}
                />
              ))}

              {/* Grand Total */}
              <tr className="bg-slate-100 font-semibold">
                <td className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-sm text-slate-700">
                  Grand Total
                </td>
                {visibleColumns.map((col) => (
                  <td key={col.type === 'month' ? col.key : `ys-${col.year}`} className="px-2 py-2" />
                ))}
                <td className="px-3 py-2 text-right text-sm text-slate-800">
                  {formatCurrencyDetailed(grandTotalEur)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Feedback + Actions */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Feedback for Project Lead (required)
          </label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Explain the requested changes..."
            rows={3}
            className="text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={submitting || !feedback.trim()}
          >
            {submitting ? 'Submitting...' : 'Confirm Changes'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- EditRow sub-component ---

interface EditRowProps {
  line: EditLine;
  visibleColumns: ReturnType<typeof useCollapsibleYears>['visibleColumns'];
  editingCell: string | null;
  onEditStart: (cellId: string | null) => void;
  onCellChange: (lineId: string, month: string, value: number) => void;
  onRemove: (lineId: string) => void;
  getLineTotal: (line: EditLine) => number;
  getLineTotalEur: (line: EditLine) => number;
  getYearTotal: (line: EditLine, months: string[]) => number;
  isChanged: (lineId: string, month: string, value: number) => boolean;
}

function EditRow({
  line, visibleColumns, editingCell, onEditStart, onCellChange, onRemove,
  getLineTotal, getLineTotalEur, getYearTotal, isChanged,
}: EditRowProps) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50">
      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-sm text-slate-700 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span>{line.name}</span>
          {line.category === 'internal' && line.rate > 1 && (
            <span className="text-[10px] text-slate-400">@{formatNumber(line.rate)}/h</span>
          )}
        </div>
      </td>
      {visibleColumns.map((col) => {
        if (col.type === 'yearSummary') {
          const yearSum = getYearTotal(line, col.months);
          return (
            <td key={`ys-${col.year}`} className="px-2 py-1.5 text-center text-xs text-slate-500">
              {yearSum > 0 ? formatNumber(yearSum) : '\u2014'}
            </td>
          );
        }
        const cellId = `${line.id}:${col.key}`;
        const value = line.monthValues[col.key] || 0;
        const isEditing = editingCell === cellId;
        const changed = isChanged(line.id, col.key, value);

        return (
          <td key={col.key} className="px-1 py-1">
            {isEditing ? (
              <Input
                type="number"
                autoFocus
                defaultValue={value || ''}
                className="h-7 w-[65px] text-xs text-center px-1"
                onBlur={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  onCellChange(line.id, col.key, v);
                  onEditStart(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    if (e.key === 'Enter') {
                      const v = parseFloat((e.target as HTMLInputElement).value) || 0;
                      onCellChange(line.id, col.key, v);
                    }
                    onEditStart(null);
                  }
                }}
              />
            ) : (
              <button
                className={`w-full h-7 text-xs text-center rounded transition-colors ${
                  changed
                    ? 'bg-amber-100 text-amber-800 font-medium hover:bg-amber-200'
                    : 'hover:bg-blue-50'
                }`}
                onClick={() => onEditStart(cellId)}
              >
                {value > 0 ? formatNumber(value) : '\u2014'}
              </button>
            )}
          </td>
        );
      })}
      <td className="px-3 py-1.5 text-right text-xs font-medium text-slate-700 whitespace-nowrap">
        {line.category === 'internal' ? (
          <span>{formatNumber(getLineTotal(line))}h / {formatCurrencyDetailed(getLineTotalEur(line))}</span>
        ) : (
          <span>{formatCurrencyDetailed(getLineTotalEur(line))}</span>
        )}
      </td>
      <td className="px-1 py-1.5">
        <button
          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
          onClick={() => onRemove(line.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
