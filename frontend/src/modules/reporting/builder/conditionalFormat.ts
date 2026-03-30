/**
 * Conditional formatting — color palette, presets, and evaluation logic.
 */
import type { ConditionalFormatRule, FormatPresetId, FormatOperator } from '@/types/reportBuilder';

/* ── Color palette ── */

export const FORMAT_COLORS = [
  { id: 'green', label: 'Green', light: '#E6F4EA', dark: 'rgba(34,197,94,0.18)' },
  { id: 'amber', label: 'Amber', light: '#FFF3E0', dark: 'rgba(245,158,11,0.18)' },
  { id: 'red', label: 'Red', light: '#FDECEA', dark: 'rgba(239,68,68,0.18)' },
  { id: 'blue', label: 'Blue', light: '#E3F2FD', dark: 'rgba(59,130,246,0.18)' },
] as const;

export type FormatColorId = (typeof FORMAT_COLORS)[number]['id'];

/** Get the appropriate color value for current theme */
export function getThemeColor(colorHex: string, isDark: boolean): string {
  const paletteEntry = FORMAT_COLORS.find((c) => c.light === colorHex);
  if (paletteEntry && isDark) return paletteEntry.dark;
  return colorHex;
}

/* ── Operator labels ── */

export const OPERATOR_OPTIONS: { value: FormatOperator; label: string }[] = [
  { value: '<', label: '< less than' },
  { value: '<=', label: '\u2264 less or equal' },
  { value: '>', label: '> greater than' },
  { value: '>=', label: '\u2265 greater or equal' },
  { value: '=', label: '= equals' },
  { value: 'between', label: 'between' },
];

export function formatOperatorLabel(op: FormatOperator): string {
  switch (op) {
    case '<': return '<';
    case '<=': return '\u2264';
    case '>': return '>';
    case '>=': return '\u2265';
    case '=': return '=';
    case 'between': return 'between';
  }
}

/* ── Presets ── */

interface PresetDef {
  id: FormatPresetId;
  label: string;
  description: string;
  requiredMeasureId: string;
  rules: Omit<ConditionalFormatRule, 'id'>[];
}

let ruleCounter = 0;
function nextRuleId(): string {
  return `rule-${++ruleCounter}-${Date.now()}`;
}

export function generateRuleId(): string {
  return nextRuleId();
}

export const FORMAT_PRESETS: PresetDef[] = [
  {
    id: 'budget_variance_rag',
    label: 'Budget Variance RAG',
    description: 'Green < 5%, Amber 5\u201310%, Red > 10%',
    requiredMeasureId: 'M05',
    rules: [
      { measureId: 'M05', operator: '<', value: 5, color: '#E6F4EA', label: 'Variance < 5%' },
      { measureId: 'M05', operator: 'between', value: 5, value2: 10, color: '#FFF3E0', label: 'Variance 5\u201310%' },
      { measureId: 'M05', operator: '>', value: 10, color: '#FDECEA', label: 'Variance > 10%' },
    ],
  },
  {
    id: 'utilisation_rag',
    label: 'Utilisation RAG',
    description: 'Red < 60%, Amber 60\u201385%, Green > 85%',
    requiredMeasureId: 'M14',
    rules: [
      { measureId: 'M14', operator: '<', value: 60, color: '#FDECEA', label: 'Utilisation < 60%' },
      { measureId: 'M14', operator: 'between', value: 60, value2: 85, color: '#FFF3E0', label: 'Utilisation 60\u201385%' },
      { measureId: 'M14', operator: '>', value: 85, color: '#E6F4EA', label: 'Utilisation > 85%' },
    ],
  },
  {
    id: 'spend_threshold',
    label: 'Spend Threshold',
    description: 'Amber > \u20AC100k, Red > \u20AC500k',
    requiredMeasureId: 'M03',
    rules: [
      { measureId: 'M03', operator: '>', value: 100000, color: '#FFF3E0', label: 'Actuals > \u20AC100k' },
      { measureId: 'M03', operator: '>', value: 500000, color: '#FDECEA', label: 'Actuals > \u20AC500k' },
    ],
  },
];

/** Check if a preset's required measure is in the active values */
export function isPresetAvailable(presetId: FormatPresetId, activeMeasureIds: string[]): boolean {
  const preset = FORMAT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return false;
  return activeMeasureIds.includes(preset.requiredMeasureId);
}

/** Generate rules for a preset, each with a unique ID */
export function getPresetRules(presetId: FormatPresetId): ConditionalFormatRule[] {
  const preset = FORMAT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return [];
  return preset.rules.map((r) => ({ ...r, id: nextRuleId() }));
}
