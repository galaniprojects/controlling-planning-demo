import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SuggestionItem } from '@/types/api';
import { Sparkles, Check, X } from 'lucide-react';

interface Props {
  suggestions: SuggestionItem[];
  appliedIds: number[];
  dismissedIds: number[];
  onApply: (id: number) => void;
  onDismiss: (id: number) => void;
  onContinue: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  trend: 'Trend',
  actuals_correction: 'Actuals Correction',
  burn_rate: 'Burn Rate',
  utilization: 'Utilization',
  seasonal: 'Seasonal',
  resource_increase: 'Resource',
};

export function Phase2Suggestions({
  suggestions,
  appliedIds,
  dismissedIds,
  onApply,
  onDismiss,
  onContinue,
}: Props) {
  if (suggestions.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Phase 2: System Suggestions
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            No suggestions for this cycle. Proceeding to edit.
          </p>
        </div>
        <Button onClick={onContinue}>Continue to Edit</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Phase 2: System Suggestions
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Review system-generated insights. Apply or dismiss each suggestion
          before editing the forecast.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {suggestions.map((s) => {
          const isApplied = appliedIds.includes(s.id);
          const isDismissed = dismissedIds.includes(s.id);
          return (
            <Card
              key={s.id}
              className={
                isApplied
                  ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                  : isDismissed
                    ? 'opacity-50'
                    : ''
              }
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {TYPE_LABELS[s.type] || s.type}
                  </Badge>
                  {isApplied && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 text-[10px]">
                      Applied
                    </Badge>
                  )}
                  {isDismissed && (
                    <Badge variant="outline" className="text-[10px]">
                      Dismissed
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground">{s.observation}</p>
                <p className="text-sm font-medium text-foreground">
                  {s.recommendation}
                </p>
                <p className="text-xs text-muted-foreground">{s.impact_description}</p>
                <div className="flex gap-2 pt-1">
                  {!isApplied && (
                    <Button
                      size="sm"
                      variant={isDismissed ? 'outline' : 'default'}
                      className={
                        !isDismissed
                          ? 'bg-green-600 hover:bg-green-700'
                          : ''
                      }
                      onClick={() => onApply(s.id)}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Apply
                    </Button>
                  )}
                  {!isDismissed && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDismiss(s.id)}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Dismiss
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button onClick={onContinue}>Continue to Edit</Button>
    </div>
  );
}
