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
import { formatCurrencyDetailed } from '@/lib/formatters';
import { formatMonthShort } from '@/lib/yearColumns';
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
  const totalImpact = allChanges.reduce((sum, item) => sum + (item.delta_eur ?? item.delta ?? 0), 0);
  const totalChangeCount = allChanges.length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Phase 4: Review & Submit
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Review your changes below. Provide justification for each affected
          cost centre before submitting.
        </p>
      </div>

      {/* Impact summary */}
      <div className="flex items-center gap-4">
        <Card className="border-primary/30 bg-primary/5 flex-1">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-primary">
                Total Impact
              </span>
              <span className="text-lg font-semibold text-primary">
                {totalImpact > 0 ? '+' : ''}{formatCurrencyDetailed(totalImpact)}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border flex-1">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Changes
              </span>
              <span className="text-lg font-semibold text-foreground">
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
            <h4 className="text-sm font-medium text-foreground mb-3">
              All Affected Line Items
            </h4>
            <div className="border border-border rounded overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="sticky left-0 bg-muted/50 z-10 min-w-[160px]">
                      Line Item
                    </TableHead>
                    {reviewGridData.months.map((m) => (
                      <TableHead key={m} className="text-center min-w-[120px]">
                        {formatMonthShort(m)} {m.slice(2, 4)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewGridData.line_items.map((li) => (
                    <TableRow key={li.id}>
                      <TableCell className="sticky left-0 bg-card z-10 border-r border-border/50">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground">
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
                                  ? 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                                  : 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                              }`}
                            >
                              {li.capex_opex === 'capex' ? 'CapEx' : 'OpEx'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      {li.months.map((mv) => (
                        <TableCell key={mv.month} className="text-center">
                          {mv.before_eur !== null && mv.after_eur !== null ? (
                            <div className="space-y-0.5">
                              {/* Hours row — only for internal items */}
                              {mv.before !== null && mv.after !== null && (
                                <div className="text-[10px] text-muted-foreground">
                                  <span className="line-through">{mv.before}h</span>
                                  {' \u2192 '}
                                  <span className="font-medium">{mv.after}h</span>
                                  {mv.delta !== null && mv.delta !== 0 && (
                                    <span className={mv.delta > 0 ? ' text-red-500 dark:text-red-400' : ' text-green-600'}>
                                      {' '}{mv.delta > 0 ? '+' : ''}{mv.delta}h
                                    </span>
                                  )}
                                </div>
                              )}
                              {/* EUR row — always shown */}
                              <div className="text-[10px] text-muted-foreground line-through">
                                {formatCurrencyDetailed(mv.before_eur)}
                              </div>
                              <div className="text-xs font-medium text-foreground">
                                {formatCurrencyDetailed(mv.after_eur)}
                              </div>
                              {mv.delta_eur !== null && mv.delta_eur !== 0 && (
                                <div
                                  className={`text-[10px] ${
                                    mv.delta_eur > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                                  }`}
                                >
                                  {mv.delta_eur > 0 ? '+' : ''}{formatCurrencyDetailed(mv.delta_eur)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
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
          <h4 className="text-sm font-medium text-foreground">
            Justification by Cost Centre
          </h4>
          {groups.map((group) => (
            <Card key={group.id} className="border-border">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h5 className="font-medium text-foreground">
                    {group.name}
                  </h5>
                  <Badge variant="outline" className="text-[10px]">
                    {group.items.length} change{group.items.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
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
                  <h5 className="font-medium text-foreground">
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
