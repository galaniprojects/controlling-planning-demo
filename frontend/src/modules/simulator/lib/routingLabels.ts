/**
 * v5 B2 — Routing-decision label helpers.
 *
 * The Promote workflow returns 12 distinct `routing_type` values per
 * `services/scenario_promote.py`. The frontend needs human-readable
 * labels for the routing preview and the audit drawer. Keep the map
 * here so T1 (drawer / apply / promote shells) and T4 (full promote
 * flow) reuse the same labels.
 */

export const ROUTING_TYPE_LABELS: Record<string, string> = {
  forecast_cell: 'Forecast cell',
  distribution_canonical: 'Stage 1 distribution',
  btc_canonical: 'Stage 2 BTC profile',
  to_business_canonical: 'To-business %',
  rate_table: 'Rate table',
  milestone_baseline: 'Milestone baseline',
  hierarchy_node: 'Hierarchy node',
  pipeline_stage: 'Pipeline stage',
  tech_navigator: 'Tech Navigator score',
  capacity_param: 'Capacity parameter',
  noop: 'No-op',
  blocked: 'Blocked',
};

export function routingLabel(routingType: string): string {
  return ROUTING_TYPE_LABELS[routingType] ?? routingType;
}
