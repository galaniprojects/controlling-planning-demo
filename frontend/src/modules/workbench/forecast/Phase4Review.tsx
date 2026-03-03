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
import { formatCurrency } from '@/lib/formatters';
import type { ReviewGroup } from '@/types/api';
import { Sparkles } from 'lucide-react';

interface Props {
  reviewGroups: ReviewGroup[];
  justifications: Record<string, string>;
  onSetJustification: (groupType: string, text: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  loading: boolean;
}

const GROUP_LABELS: Record<string, string> = {
  resource: 'Resource Changes',
  external_cost: 'External Cost Changes',
  other: 'Other Changes',
};

export function Phase4Review({
  reviewGroups,
  justifications,
  onSetJustification,
  onSubmit,
  onBack,
  loading,
}: Props) {
  const allJustified = reviewGroups.every(
    (g) => justifications[g.type]?.trim(),
  );

  const totalImpact = reviewGroups.reduce(
    (sum, g) => sum + g.items.reduce((s, item) => s + item.delta, 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-800">
          Phase 4: Review & Submit
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Review your changes and provide justifications before submitting for
          approval.
        </p>
      </div>

      {/* Impact summary */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">
              Total Impact
            </span>
            <span className="text-lg font-semibold text-blue-900">
              {totalImpact > 0 ? '+' : ''}
              {formatCurrency(totalImpact)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Change groups */}
      {reviewGroups.map((group) => (
        <Card key={group.type}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-slate-800">
                {GROUP_LABELS[group.type] || group.type}
              </h4>
              <Badge variant="outline" className="text-[10px]">
                {group.count} item{group.count !== 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="border border-slate-200 rounded overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Field</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Old</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">
                        {item.sub_category}
                      </TableCell>
                      <TableCell className="text-sm">{item.month}</TableCell>
                      <TableCell className="text-right text-sm">
                        {item.old_value.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {item.new_value.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {item.delta > 0 ? '+' : ''}
                        {item.delta.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {item.suggestion_id != null && (
                          <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">
                Justification (required)
              </label>
              <Textarea
                rows={2}
                placeholder="Explain the business reason for these changes..."
                value={justifications[group.type] || ''}
                onChange={(e) =>
                  onSetJustification(group.type, e.target.value)
                }
              />
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex gap-2">
        <Button
          onClick={onSubmit}
          disabled={loading || !allJustified}
        >
          {loading ? 'Submitting...' : 'Submit Forecast'}
        </Button>
        <Button variant="outline" onClick={onBack} disabled={loading}>
          Back to Edit
        </Button>
      </div>
    </div>
  );
}
