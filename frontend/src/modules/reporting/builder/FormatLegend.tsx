/**
 * FormatLegend — shows active conditional formatting rules below the table.
 */
import type { ConditionalFormatRule, MeasureItem } from '@/types/reportBuilder';
import { formatOperatorLabel } from './conditionalFormat';
import { formatCurrencyDetailed, formatNumber, formatPercent } from '@/lib/formatters';

interface FormatLegendProps {
  rules: ConditionalFormatRule[];
  measures: MeasureItem[];
}

function formatRuleValue(value: number, measure: MeasureItem): string {
  switch (measure.format) {
    case 'currency':
      return formatCurrencyDetailed(value);
    case 'percent':
      return formatPercent(value);
    case 'hours':
      return `${formatNumber(value)} h`;
    default:
      return formatNumber(value);
  }
}

export function FormatLegend({ rules, measures }: FormatLegendProps) {
  if (rules.length === 0) return null;

  const measureMap = new Map(measures.map((m) => [m.id, m]));

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Formatting:</span>
      {rules.map((rule) => {
        const measure = measureMap.get(rule.measureId);
        if (!measure) return null;
        const label =
          rule.label ||
          `${measure.display_name} ${formatOperatorLabel(rule.operator)} ${formatRuleValue(rule.value, measure)}${
            rule.operator === 'between' && rule.value2 !== undefined
              ? ` \u2013 ${formatRuleValue(rule.value2, measure)}`
              : ''
          }`;
        return (
          <span
            key={rule.id}
            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border border-border"
          >
            <span
              className="w-3 h-3 rounded-sm inline-block flex-shrink-0"
              style={{ backgroundColor: rule.color }}
            />
            {label}
          </span>
        );
      })}
    </div>
  );
}
