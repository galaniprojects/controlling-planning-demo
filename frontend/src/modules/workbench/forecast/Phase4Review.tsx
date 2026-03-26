import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { formatCurrencyDelta, formatCurrencyDetailed } from '@/lib/formatters';
import { Sparkles } from 'lucide-react';
import type { ReviewGroup, ReviewGridData, CostCentreGroup } from '@/types/api';

interface Props {
  reviewGroups: ReviewGroup[];
  reviewGridData: ReviewGridData | null;
  costCentreGroups: CostCentreGroup[];
  justifications: Record<string, string>;
  onSetJustification: (groupKey: string, text: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  loading: boolean;
}

export function Phase4Review({
  reviewGroups,
  reviewGridData,
  costCentreGroups,
  justifications,
  onSetJustification,
  onSubmit,
  onBack,
  loading,
}: Props) {
  // Determine which groups need justification
  const groups = costCentreGroups.length > 0 ? costCentreGroups : null;
  const allJustified = groups
    ? groups.every((g) => justifications[g.id]?.trim())
    : reviewGroups.every((g) => justifications[g.type]?.trim());

  // Total impact from all changes
  const allChanges = costCentreGroups.length > 0
    ? costCentreGroups.flatMap((g) => g.items)
    : reviewGroups.flatMap((g) => g.items);
  const totalImpact = allChanges.reduce((sum, item) => sum + (item.delta ?? 0), 0);
  const totalChangeCount = allChanges.length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-800">
          Phase 4: Review & Submit
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Review your changes below. Provide justification for each affected
          cost centre before submitting.
        </p>
      </div>

      {/* Impact summary */}
      <div className="flex items-center gap-4">
        <Card className="border-blue-200 bg-blue-50 flex-1">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800">
                Total Impact
              </span>
              <span className="text-lg font-semibold text-blue-900">
                {formatCurrencyDelta(totalImpact)}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 flex-1">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">
                Changes
              </span>
              <span className="text-lg font-semibold text-slate-800">
                {totalChangeCount}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparison grid */}
      {reviewGridData && reviewGridData.line_items.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">
              All Affected Line Items
            </h4>
            <div className="border border-slate-200 rounded overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="sticky left-0 bg-slate-50 z-10 min-w-[160px]">
                      Line Item
                    </TableHead>
                    {reviewGridData.months.map((m) => (
                      <TableHead key={m} className="text-center min-w-[120px]">
                        {m}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewGridData.line_items.map((li) => (
                    <TableRow key={li.id}>
                      <TableCell className="sticky left-0 bg-white z-10 border-r border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-slate-700">
                            {li.label}
                          </span>
                          {li.is_system_suggested && (
                            <Sparkles className="h-3 w-3 text-blue-500 shrink-0" />
                          )}
                          {li.capex_opex && (
                            <Badge
                              variant="outline"
                              className={`text-[8px] px-1 py-0 h-3.5 ${
                                li.capex_opex === 'capex'
                                  ? 'text-blue-600 border-blue-200'
                                  : 'text-amber-600 border-amber-200'
                              }`}
                            >
                              {li.capex_opex === 'capex' ? 'CapEx' : 'OpEx'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      {li.months.map((mv) => (
                        <TableCell key={mv.month} className="text-center">
                          {mv.before !== null && mv.after !== null ? (
                            <div className="space-y-0.5">
                              <div className="text-[10px] text-slate-400 line-through">
                                {formatCurrencyDetailed(mv.before)}
                              </div>
                              <div className="text-xs font-medium text-slate-700">
                                {formatCurrencyDetailed(mv.after)}
                              </div>
                              {mv.delta !== null && mv.delta !== 0 && (
                                <div
                                  className={`text-[10px] ${
                                    mv.delta > 0 ? 'text-red-500' : 'text-green-600'
                                  }`}
                                >
                                  {formatCurrencyDelta(mv.delta)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-cost-centre justification */}
      {groups ? (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700">
            Justification by Cost Centre
          </h4>
          {groups.map((group) => (
            <Card key={group.id} className="border-slate-200">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h5 className="font-medium text-slate-800">
                    {group.name}
                  </h5>
                  <Badge variant="outline" className="text-[10px]">
                    {group.items.length} change{group.items.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500">
                  Affected: {group.line_items.map((li) => li.label).join(', ')}
                </div>
                <Textarea
                  rows={2}
                  placeholder={`Explain changes affecting ${group.name}...`}
                  value={justifications[group.id] || ''}
                  onChange={(e) => onSetJustification(group.id, e.target.value)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Legacy: per-type justification */
        <div className="space-y-3">
          {reviewGroups.map((group) => (
            <Card key={group.type}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h5 className="font-medium text-slate-800">
                    {group.type === 'resource'
                      ? 'Resource Changes'
                      : group.type === 'external_cost'
                        ? 'External Cost Changes'
                        : 'Other Changes'}
                  </h5>
                  <Badge variant="outline" className="text-[10px]">
                    {group.count} item{group.count !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <Textarea
                  rows={2}
                  placeholder="Explain the business reason for these changes..."
                  value={justifications[group.type] || ''}
                  onChange={(e) =>
                    onSetJustification(group.type, e.target.value)
                  }
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={loading || !allJustified}>
          {loading ? 'Submitting...' : 'Submit Forecast'}
        </Button>
        <Button variant="outline" onClick={onBack} disabled={loading}>
          Back to Edit
        </Button>
      </div>
    </div>
  );
}
