import type { CalcOperator, CalculatedMeasureDef, MeasureItem } from '@/types/reportBuilder';

let counter = 0;

export function generateCalcId(): string {
  counter += 1;
  return `CALC_${String(counter).padStart(3, '0')}`;
}

export function isCalculatedMeasure(m: MeasureItem): boolean {
  return m.aggregation === 'CALCULATED' && !!m.calculated;
}

/** Build a MeasureItem from a user-defined formula. */
export function buildCalculatedMeasureItem(def: {
  name: string;
  operandA: string;
  operator: CalcOperator;
  operandB: string;
  format: string;
  id?: string;
}): MeasureItem {
  return {
    id: def.id ?? generateCalcId(),
    display_name: def.name,
    category: 'Calculated',
    aggregation: 'CALCULATED',
    format: def.format,
    compatibility_note: null,
    calculated: {
      operandA: def.operandA,
      operator: def.operator,
      operandB: def.operandB,
    },
  };
}

/**
 * Validate that a formula doesn't create circular or too-deep nesting.
 * Returns an error string, or null if valid.
 */
export function validateFormula(
  operandA: string,
  operandB: string,
  allCalcMeasures: MeasureItem[],
  editingId?: string,
): string | null {
  const calcMap = new Map(allCalcMeasures.map((m) => [m.id, m]));

  // Can't reference itself
  if (editingId && (operandA === editingId || operandB === editingId)) {
    return 'A calculated measure cannot reference itself.';
  }

  // Check nesting depth: if an operand is a calc measure, that calc measure
  // must not itself reference any calc measure (max 1 level of nesting).
  for (const opId of [operandA, operandB]) {
    const dep = calcMap.get(opId);
    if (dep?.calculated) {
      const { operandA: a, operandB: b } = dep.calculated;
      if (calcMap.has(a) || calcMap.has(b)) {
        return `"${dep.display_name}" already references other calculated measures. Only one level of nesting is allowed.`;
      }
      // Check for circular: if dep references the measure being edited
      if (editingId && (a === editingId || b === editingId)) {
        return 'Circular reference detected.';
      }
    }
  }

  return null;
}

/**
 * Topological sort of calculated measures so dependencies are computed first.
 * Returns a new ordered array.
 */
function sortByDependency(calcMeasures: MeasureItem[]): MeasureItem[] {
  const calcIds = new Set(calcMeasures.map((m) => m.id));
  const noDeps: MeasureItem[] = [];
  const hasDeps: MeasureItem[] = [];

  for (const m of calcMeasures) {
    const def = m.calculated!;
    if (calcIds.has(def.operandA) || calcIds.has(def.operandB)) {
      hasDeps.push(m);
    } else {
      noDeps.push(m);
    }
  }

  return [...noDeps, ...hasDeps];
}

function applyOp(a: number | null, op: CalcOperator, b: number | null): number | null {
  if (a == null || b == null) return null;
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? null : a / b;
  }
}

/**
 * Compute calculated measure values on flat result rows (mutates rows in-place).
 * Must be called before cross-tab transform.
 */
export function computeCalculatedValues(
  rows: Record<string, string | number | null>[],
  calcMeasures: MeasureItem[],
): void {
  const sorted = sortByDependency(calcMeasures);

  for (const row of rows) {
    for (const m of sorted) {
      const def = m.calculated!;
      const a = row[def.operandA] as number | null ?? null;
      const b = row[def.operandB] as number | null ?? null;
      row[m.id] = applyOp(a, def.operator, b);
    }
  }
}

/**
 * Collect all base (non-calculated) measure IDs that calculated measures depend on.
 */
export function getRequiredBaseMeasures(calcMeasures: MeasureItem[]): string[] {
  const baseIds = new Set<string>();
  const calcIds = new Set(calcMeasures.map((m) => m.id));

  for (const m of calcMeasures) {
    const def = m.calculated!;
    if (!calcIds.has(def.operandA)) baseIds.add(def.operandA);
    if (!calcIds.has(def.operandB)) baseIds.add(def.operandB);
    // If operand is a calc measure, trace through to its base operands
    const depA = calcMeasures.find((c) => c.id === def.operandA);
    if (depA?.calculated) {
      if (!calcIds.has(depA.calculated.operandA)) baseIds.add(depA.calculated.operandA);
      if (!calcIds.has(depA.calculated.operandB)) baseIds.add(depA.calculated.operandB);
    }
    const depB = calcMeasures.find((c) => c.id === def.operandB);
    if (depB?.calculated) {
      if (!calcIds.has(depB.calculated.operandA)) baseIds.add(depB.calculated.operandA);
      if (!calcIds.has(depB.calculated.operandB)) baseIds.add(depB.calculated.operandB);
    }
  }

  return [...baseIds];
}
