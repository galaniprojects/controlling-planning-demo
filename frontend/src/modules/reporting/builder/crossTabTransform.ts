/**
 * Cross-tabulation transform — converts flat API rows into a pivoted structure
 * for rendering nested row/column headers, subtotals, and grand totals.
 */
import type {
  ReportExecuteResponse,
  DimensionItem,
  MeasureItem,
  ColHeaderNode,
  ColLeaf,
  RowEntry,
  RowGroup,
  CrossTabData,
} from '@/types/reportBuilder';

const COL_KEY_SEP = '|';

/** Build a composite key from column dimension values + measure id */
function makeColKey(colDimValues: string[], measureId: string): string {
  return [...colDimValues, measureId].join(COL_KEY_SEP);
}

/** Sort column dim value combos naturally (fiscal year, quarter, month sort correctly as strings) */
function sortColCombos(combos: string[][]): string[][] {
  return [...combos].sort((a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const va = a[i] ?? '';
      const vb = b[i] ?? '';
      const cmp = va.localeCompare(vb, undefined, { numeric: true });
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

/**
 * Build the nested column header tree and leaf list.
 *
 * When column dims exist, each unique combination of column dim values
 * becomes a group, with measures as the innermost level.
 * When no column dims exist, measures become direct columns.
 */
function buildColumnStructure(
  rows: Record<string, string | number>[],
  colDimIds: string[],
  measures: MeasureItem[],
): { headerLevels: ColHeaderNode[][]; colLeaves: ColLeaf[] } {
  if (colDimIds.length === 0) {
    // No column dimensions — each measure is a simple column
    const leaves: ColLeaf[] = measures.map((m) => ({
      colKey: makeColKey([], m.id),
      measureId: m.id,
      measureFormat: m.format,
      labels: [],
    }));
    const headerLevel: ColHeaderNode[] = measures.map((m) => ({
      label: m.display_name,
      span: 1,
    }));
    return { headerLevels: [headerLevel], colLeaves: leaves };
  }

  // Collect unique column dimension value combinations
  const comboSet = new Set<string>();
  for (const row of rows) {
    const vals = colDimIds.map((id) => String(row[id] ?? ''));
    comboSet.add(vals.join(COL_KEY_SEP));
  }
  const combos = sortColCombos(
    Array.from(comboSet).map((s) => s.split(COL_KEY_SEP)),
  );

  // Build leaf columns: each combo × each measure
  const colLeaves: ColLeaf[] = [];
  for (const combo of combos) {
    for (const m of measures) {
      colLeaves.push({
        colKey: makeColKey(combo, m.id),
        measureId: m.id,
        measureFormat: m.format,
        labels: combo,
      });
    }
  }

  // Build header levels (one row per column dim level + one for measures if >1 measure)
  const headerLevels: ColHeaderNode[][] = [];

  for (let level = 0; level < colDimIds.length; level++) {
    const nodes: ColHeaderNode[] = [];
    let prevLabel: string | null = null;
    let currentNode: ColHeaderNode | null = null;

    for (const combo of combos) {
      // Check if this combo shares the same prefix up to this level
      const label = combo[level];
      const parentMatch =
        level === 0 ||
        combo.slice(0, level).join(COL_KEY_SEP) ===
          (nodes.length > 0 || currentNode
            ? combos[combos.indexOf(combo) > 0 ? combos.indexOf(combo) - 1 : 0]
                .slice(0, level)
                .join(COL_KEY_SEP)
            : '');

      if (label === prevLabel && parentMatch && currentNode) {
        currentNode.span += measures.length;
      } else {
        currentNode = { label, span: measures.length };
        nodes.push(currentNode);
        prevLabel = label;
      }
    }
    headerLevels.push(nodes);
  }

  // Add measure name header row if there are multiple measures
  if (measures.length > 1) {
    const measureHeaders: ColHeaderNode[] = [];
    for (let i = 0; i < combos.length; i++) {
      for (const m of measures) {
        measureHeaders.push({ label: m.display_name, span: 1 });
      }
    }
    headerLevels.push(measureHeaders);
  }

  return { headerLevels, colLeaves };
}

/**
 * Group flat rows into nested RowGroups by the outermost row dimension.
 * If only one row dim exists, each unique value becomes its own group.
 * If no row dims exist, all rows go into a single unnamed group.
 */
function buildRowGroups(
  rows: Record<string, string | number>[],
  rowDimIds: string[],
  colDimIds: string[],
  colLeaves: ColLeaf[],
  measures: MeasureItem[],
): RowGroup[] {
  if (rowDimIds.length === 0) {
    // No row dimensions — all data in a single group
    const entries = rowsToEntries(rows, rowDimIds, colDimIds, colLeaves, measures);
    const subtotals = computeSubtotals(entries, colLeaves);
    return [{ key: '__all__', label: 'All', children: entries, subtotals }];
  }

  const outerDimId = rowDimIds[0];
  const groupMap = new Map<string, Record<string, string | number>[]>();
  const groupOrder: string[] = [];

  for (const row of rows) {
    const key = String(row[outerDimId] ?? '');
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
      groupOrder.push(key);
    }
    groupMap.get(key)!.push(row);
  }

  return groupOrder.map((key) => {
    const groupRows = groupMap.get(key)!;
    const children = rowsToEntries(groupRows, rowDimIds, colDimIds, colLeaves, measures);
    const subtotals = computeSubtotals(children, colLeaves);
    return { key, label: key, children, subtotals };
  });
}

/**
 * Convert flat API rows into RowEntry objects with cell values keyed by colKey.
 * Multiple flat rows that share the same inner row dim values are merged into
 * a single RowEntry — each flat row fills in cells for its column dim values.
 */
function rowsToEntries(
  rows: Record<string, string | number>[],
  rowDimIds: string[],
  colDimIds: string[],
  colLeaves: ColLeaf[],
  measures: MeasureItem[],
): RowEntry[] {
  // Key for merging = all row dim values except the first (outermost, already used for grouping)
  const innerDimIds = rowDimIds.slice(1);

  const entryMap = new Map<string, RowEntry>();
  const entryOrder: string[] = [];

  for (const row of rows) {
    const innerKey = innerDimIds.length > 0
      ? innerDimIds.map((id) => String(row[id] ?? '')).join(COL_KEY_SEP)
      : '__single__';

    let entry = entryMap.get(innerKey);
    if (!entry) {
      const dimValues: Record<string, string> = {};
      for (const dimId of rowDimIds) {
        dimValues[dimId] = String(row[dimId] ?? '');
      }
      entry = { dimValues, cells: {} };
      entryMap.set(innerKey, entry);
      entryOrder.push(innerKey);
    }

    if (colDimIds.length === 0) {
      // No column dims — measures keyed directly
      for (const m of measures) {
        const colKey = makeColKey([], m.id);
        const val = row[m.id];
        if (val !== null && val !== undefined) {
          entry.cells[colKey] = (entry.cells[colKey] ?? 0) + Number(val);
        }
      }
    } else {
      // Map this row's column dim values to the correct col keys
      const colVals = colDimIds.map((id) => String(row[id] ?? ''));
      for (const m of measures) {
        const colKey = makeColKey(colVals, m.id);
        const val = row[m.id];
        if (val !== null && val !== undefined) {
          entry.cells[colKey] = (entry.cells[colKey] ?? 0) + Number(val);
        }
      }
    }
  }

  return entryOrder.map((key) => entryMap.get(key)!);
}

/** Compute subtotals for a group by summing cell values across entries */
function computeSubtotals(
  entries: RowEntry[],
  colLeaves: ColLeaf[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const leaf of colLeaves) {
    let sum = 0;
    let hasValue = false;
    for (const entry of entries) {
      const val = entry.cells[leaf.colKey];
      if (val !== null && val !== undefined) {
        sum += val;
        hasValue = true;
      }
    }
    totals[leaf.colKey] = hasValue ? sum : 0;
  }
  return totals;
}

/** Compute grand totals across all row groups */
function computeGrandTotals(
  groups: RowGroup[],
  colLeaves: ColLeaf[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const leaf of colLeaves) {
    let sum = 0;
    for (const group of groups) {
      sum += group.subtotals[leaf.colKey] ?? 0;
    }
    totals[leaf.colKey] = sum;
  }
  return totals;
}

/**
 * Main entry point: transform flat API response into CrossTabData.
 */
export function buildCrossTabData(
  results: ReportExecuteResponse,
  rowDims: DimensionItem[],
  colDims: DimensionItem[],
  measures: MeasureItem[],
): CrossTabData {
  const rowDimIds = rowDims.map((d) => d.id);
  const colDimIds = colDims.map((d) => d.id);

  const { headerLevels, colLeaves } = buildColumnStructure(
    results.rows,
    colDimIds,
    measures,
  );

  const rowGroups = buildRowGroups(
    results.rows,
    rowDimIds,
    colDimIds,
    colLeaves,
    measures,
  );

  const grandTotals = computeGrandTotals(rowGroups, colLeaves);

  return { headerLevels, colLeaves, rowGroups, grandTotals };
}
