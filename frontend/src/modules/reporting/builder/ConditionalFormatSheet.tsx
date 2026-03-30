/**
 * ConditionalFormatSheet — right-side drawer for managing conditional formatting rules.
 */
import { Plus, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  ConditionalFormatRule,
  FormatOperator,
  FormatPresetId,
  MeasureItem,
} from '@/types/reportBuilder';
import {
  FORMAT_COLORS,
  FORMAT_PRESETS,
  OPERATOR_OPTIONS,
  isPresetAvailable,
} from './conditionalFormat';

interface ConditionalFormatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  measures: MeasureItem[];
  rules: ConditionalFormatRule[];
  onAddRule: (rule: Omit<ConditionalFormatRule, 'id'>) => void;
  onRemoveRule: (ruleId: string) => void;
  onUpdateRule: (ruleId: string, updates: Partial<ConditionalFormatRule>) => void;
  onApplyPreset: (presetId: FormatPresetId) => void;
  onClearAll: () => void;
}

export function ConditionalFormatSheet({
  open,
  onOpenChange,
  measures,
  rules,
  onAddRule,
  onRemoveRule,
  onUpdateRule,
  onApplyPreset,
  onClearAll,
}: ConditionalFormatSheetProps) {
  const activeMeasureIds = measures.map((m) => m.id);

  const handleAddRule = (measureId: string) => {
    onAddRule({
      measureId,
      operator: '>',
      value: 0,
      color: FORMAT_COLORS[0].light,
      label: '',
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[460px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Conditional Formatting</SheetTitle>
          <SheetDescription>
            Apply colour rules to measure cells based on their values.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Presets */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Quick Presets</p>
            <div className="flex flex-wrap gap-2">
              <TooltipProvider delayDuration={300}>
                {FORMAT_PRESETS.map((preset) => {
                  const available = isPresetAvailable(preset.id, activeMeasureIds);
                  return (
                    <Tooltip key={preset.id}>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!available}
                            className="gap-1.5 text-xs"
                            onClick={() => onApplyPreset(preset.id)}
                          >
                            <Zap className="h-3 w-3" />
                            {preset.label}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {available ? preset.description : `Requires ${preset.requiredMeasureId} in Values zone`}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </div>
          </div>

          {/* Rules per measure */}
          {measures.map((measure) => {
            const measureRules = rules.filter((r) => r.measureId === measure.id);
            return (
              <div key={measure.id}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{measure.display_name}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-xs"
                    onClick={() => handleAddRule(measure.id)}
                  >
                    <Plus className="h-3 w-3" />
                    Add Rule
                  </Button>
                </div>
                {measureRules.length === 0 && (
                  <p className="text-xs text-muted-foreground pl-2">No rules</p>
                )}
                <div className="space-y-2">
                  {measureRules.map((rule) => (
                    <RuleRow
                      key={rule.id}
                      rule={rule}
                      onUpdate={(updates) => onUpdateRule(rule.id, updates)}
                      onRemove={() => onRemoveRule(rule.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Clear all */}
          {rules.length > 0 && (
            <div className="pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive"
                onClick={onClearAll}
              >
                Clear All Rules
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Rule Row ── */

interface RuleRowProps {
  rule: ConditionalFormatRule;
  onUpdate: (updates: Partial<ConditionalFormatRule>) => void;
  onRemove: () => void;
}

function RuleRow({ rule, onUpdate, onRemove }: RuleRowProps) {
  return (
    <div className="flex items-center gap-1.5 pl-2">
      {/* Operator */}
      <Select
        value={rule.operator}
        onValueChange={(v) => onUpdate({ operator: v as FormatOperator })}
      >
        <SelectTrigger className="h-7 w-[100px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATOR_OPTIONS.map((op) => (
            <SelectItem key={op.value} value={op.value} className="text-xs">
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value */}
      <Input
        type="number"
        value={rule.value}
        onChange={(e) => onUpdate({ value: parseFloat(e.target.value) || 0 })}
        className="h-7 w-20 text-xs"
      />

      {/* Value2 for "between" */}
      {rule.operator === 'between' && (
        <>
          <span className="text-xs text-muted-foreground">and</span>
          <Input
            type="number"
            value={rule.value2 ?? 0}
            onChange={(e) => onUpdate({ value2: parseFloat(e.target.value) || 0 })}
            className="h-7 w-20 text-xs"
          />
        </>
      )}

      {/* Color swatches */}
      <div className="flex gap-0.5 ml-1">
        {FORMAT_COLORS.map((color) => (
          <button
            key={color.id}
            className={`w-5 h-5 rounded border-2 transition-all ${
              rule.color === color.light
                ? 'border-foreground scale-110'
                : 'border-transparent hover:border-muted-foreground/50'
            }`}
            style={{ backgroundColor: color.light }}
            onClick={() => onUpdate({ color: color.light })}
            title={color.label}
          />
        ))}
      </div>

      {/* Remove */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 ml-auto"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
