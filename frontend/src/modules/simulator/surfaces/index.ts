/**
 * v5 B2 — Surface registry. T1's ScenarioWorkspacePage imports surfaces
 * via this barrel so a single import line stays terse.
 *
 * The 2 Tier-3 surfaces (PeopleMasterSurface, CapacityParametersSurface)
 * are owned by T4 and re-exported from here once they land.
 */
export { ForecastGridSurface } from './ForecastGridSurface';
export { CostAllocationSurface } from './CostAllocationSurface';
export { BacklogSandboxSurface } from './BacklogSandboxSurface';
export { RateTableSurface } from './RateTableSurface';
export { ResourceAssignmentSurface } from './ResourceAssignmentSurface';
export { MilestonesSurface } from './MilestonesSurface';
export { VendorContractsSurface } from './VendorContractsSurface';
export { SourcingMixSurface } from './SourcingMixSurface';
export { CapExOpExSurface } from './CapExOpExSurface';
export { RunningCostsSurface } from './RunningCostsSurface';
export { HierarchyReassignSurface } from './HierarchyReassignSurface';
export { BudgetEnvelopeSurface } from './BudgetEnvelopeSurface';
export { EscalationFactorsSurface } from './EscalationFactorsSurface';
export { HypotheticalProjectSurface } from './HypotheticalProjectSurface';
export { PipelineStageSurface } from './PipelineStageSurface';
export { TechNavigatorScoreSurface } from './TechNavigatorScoreSurface';
export { SurfaceCard } from './SurfaceCard';
