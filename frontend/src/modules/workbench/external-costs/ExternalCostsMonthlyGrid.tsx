/**
 * External Costs monthly grid (v5.1 C-09 — Wave 5 Teammate B).
 *
 * Lead pre-work stub. Teammate B implements:
 *   - Own data fetch via `externalCostsApi.getProjectExternalCostsMonthlyGrid`.
 *   - `useCollapsibleMixedYears` for collapsible-year columns + year-summary cells.
 *   - Multi-column right-sticky region for Vendor / Role / PO # / Contract End /
 *     Status badge / Open PO (NEW pattern — see plan for cumulative offsets).
 *   - Category-header rows (uppercase muted gray) between line items.
 *   - 4-stack `<ExternalCostCell>` cells with temporal context derived from
 *     `DEMO_DATE` (`@/lib/yearColumns`).
 *   - Row expansion keyed by `${vendor}|${sub_category}|${po_number ?? 'no-po'}`,
 *     showing `delivery_schedule` + `invoice_history`.
 */
interface Props {
  projectId: string;
  year?: number;
  roleFilter: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ExternalCostsMonthlyGrid(_props: Props) {
  return null;
}
