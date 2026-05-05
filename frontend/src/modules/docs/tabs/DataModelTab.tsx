import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ENTITY_GROUPS: { group: string; description: string; entities: EntityDef[] }[] = [
  {
    group: 'Cost-allocation root (v5)',
    description: 'Polymorphic ChargeableEntity replaces project-only allocations as the cost-flow root. Three subtypes share one model.',
    entities: [
      {
        name: 'ChargeableEntity',
        table: 'chargeable_entities',
        description: 'Polymorphic root for cost allocation. Three subtypes (Project / Offering / InternalService) share a single cost-flow model. Identifier formats: IT0<PPM> / IT00<S-code> / ITF<NNNNN>. WBS Element is generated algorithmically — never stored.',
        fields: ['id', 'entity_type', 'identifier', 'name', 'project_id', 'hierarchy_node_id', 'responsible_person_id', 'to_business_pct', 'annual_cost', 'termination_month', 'is_active'],
        relationships: ['attaches into a GroupingEntity hierarchy', 'has Distributions (out + in)', 'has BTCProfiles per year', 'derives is_change_or_run from Project.doi'],
      },
    ],
  },
  {
    group: 'Stage 1 — Inter-service distribution (v5)',
    description: 'Sparse percentage edges between chargeable entities. DAG-resolved effective cost = own + Σ(inflow × edge_percentage). Cycle-detected on save.',
    entities: [
      {
        name: 'Distribution',
        table: 'distributions',
        description: 'One row per actually-flowing edge between two ChargeableEntities for a given (year, version). Versioned alongside CRETA\'s baseline / forecast / actuals lifecycle; scenarios fork into version="scenario-{id}". Cycle detection is hard-block on save with chain in the error body.',
        fields: ['id', 'year', 'version', 'source_entity_id', 'destination_entity_id', 'percentage'],
        relationships: ['source ChargeableEntity', 'destination ChargeableEntity', 'sum-rule: to_business_pct + Σ(percentage) ≤ 100'],
      },
    ],
  },
  {
    group: 'Stage 2 — BTC profiles + rollup cache (v5)',
    description: 'Business-Transfer-Charging splits each entity\'s effective cost across charging locations.',
    entities: [
      {
        name: 'BTCProfile',
        table: 'btc_profiles',
        description: 'Per-(entity, year) profile. Mode = manual (controller authors lines) or automatic (snapshotted from the User Measurement matrix for the entity\'s S-code). Status = draft (editable) or active (locked for billing).',
        fields: ['id', 'entity_id', 'year', 'mode', 's_code', 'um_snapshot_at', 'status', 'copied_from_profile_id'],
        relationships: ['has BTCProfileLines (cascade)', 'lineage via copied_from_profile_id', 'unique on (entity, year)'],
      },
      {
        name: 'BTCProfileLine',
        table: 'btc_profile_lines',
        description: 'Single (charging_location, percentage) cell. Sums to 100 enforced at the service layer (tolerance 0.01%). Sparse — only non-zero cells stored.',
        fields: ['id', 'profile_id', 'charging_location_id', 'percentage'],
        relationships: ['belongs to BTCProfile', 'targets a ChargingLocation'],
      },
      {
        name: 'RollupCache',
        table: 'rollup_cache',
        description: 'Persistent two-layer cost cache. cache_layer="stage1_effective" (entity effective cost = own + Σ inflows) or "stage2_location" (entity × charging-location BTC-weighted amount). Survives the request boundary; invalidated by Distribution / BTC / annual_cost writes.',
        fields: ['id', 'cache_layer', 'year', 'version', 'key_id', 'payload_json', 'computed_at'],
        relationships: ['unique on (cache_layer, year, version, key_id)'],
      },
    ],
  },
  {
    group: 'Charging master data (v5 Cluster F)',
    description: 'Three location masters (workforce / charging / legal-entity), regional + country lookups, and the User Measurement matrix.',
    entities: [
      {
        name: 'ChargingLocation',
        table: 'charging_locations',
        description: 'KB internal charging-code master (~90 codes). Drives WBS Element generation. Division is a free-text property (no controlled list per workshop).',
        fields: ['id', 'code', 'name', 'division', 'region_id', 'country_id', 'is_active'],
        relationships: ['has many LegalEntities (1:N rollup)', 'belongs to Region + Country'],
      },
      {
        name: 'LegalEntity',
        table: 'legal_entities',
        description: '~120 registered companies. Many-to-one rollup to ChargingLocation. Carries its own country FK for divergence cases (HQ in country A, charged through country B).',
        fields: ['id', 'code', 'name', 'charging_location_id', 'country_id', 'is_active'],
        relationships: ['belongs to ChargingLocation', 'belongs to Country'],
      },
      {
        name: 'Region',
        table: 'regions',
        description: 'Regional grouping lookup (EMEA, APAC, Americas).',
        fields: ['id', 'code', 'name', 'is_active'],
        relationships: ['has ChargingLocations'],
      },
      {
        name: 'Country',
        table: 'countries',
        description: 'ISO 3166-1 country lookup (ISO-2 codes — DE, FR, US).',
        fields: ['id', 'iso_code', 'name', 'is_active'],
        relationships: ['has ChargingLocations + LegalEntities'],
      },
      {
        name: 'UserMeasurement',
        table: 'user_measurements',
        description: 'Sparse versioned UM matrix (90×99 max). A "version" is the set of rows sharing (year, quarter, imported_at). Rows are never updated in place — re-imports create a new batch.',
        fields: ['id', 'year', 'quarter', 's_code', 'charging_location_id', 'value', 'source', 'imported_at'],
        relationships: ['targets a ChargingLocation', 'unique on (year, quarter, imported_at, s_code, charging_location_id)'],
      },
      {
        name: 'ExternalCostType',
        table: 'external_cost_types',
        description: 'Cost categories for vendor / outsourced spend (Consulting, Cloud-Infrastructure, Licenses, Hardware, Other). Admin-managed.',
        fields: ['id', 'name', 'is_active'],
        relationships: ['referenced by ExternalCostLine rows on projects'],
      },
    ],
  },
  {
    group: 'Configurable hierarchy (v5)',
    description: 'v4\'s hard-coded LineOfBusiness + Programme tables are gone. The portfolio hierarchy is now an n-level configurable node graph. Controllers can rename or add levels from Admin → Hierarchy without a code change.',
    entities: [
      {
        name: 'GroupingEntityType',
        table: 'grouping_entity_types',
        description: 'Defines the kinds of nodes (e.g. "Line of Business", "Programme", custom levels). The v5 replacement for the old hard-coded master tables.',
        fields: ['id', 'name', 'sort_order', 'is_active'],
        relationships: ['has many GroupingEntities'],
      },
      {
        name: 'GroupingEntity',
        table: 'grouping_entities',
        description: 'Node rows in the hierarchy. Each carries a name, a type FK, and an active flag. Free-form taxonomy.',
        fields: ['id', 'entity_type_id', 'name', 'is_active'],
        relationships: ['belongs to GroupingEntityType', 'parent/child via GroupingHierarchy', 'attaches ChargeableEntities'],
      },
      {
        name: 'GroupingHierarchy',
        table: 'grouping_hierarchies',
        description: 'Parent-child edges between GroupingEntity rows. Arbitrary depth. Encodes the actual tree shape, not the level definitions.',
        fields: ['id', 'parent_id', 'child_id', 'is_active'],
        relationships: ['parent GroupingEntity', 'child GroupingEntity'],
      },
    ],
  },
  {
    group: 'Lifecycle, scoring, and progress (v5)',
    description: 'Project milestones, deliverable checklists, progress snapshots, and immutable forecast versioning.',
    entities: [
      {
        name: 'ProjectMilestone',
        table: 'project_milestones',
        description: 'Project milestones with baseline + forecast date ranges. baseline_locked_at set on first save (baseline dates immutable thereafter except via controller override with audit).',
        fields: ['id', 'project_id', 'sequence_number', 'milestone_type_id', 'name', 'color', 'baseline_start', 'baseline_end', 'forecast_start', 'forecast_end', 'baseline_locked_at'],
        relationships: ['belongs to Project', 'optional MilestoneType', 'has Deliverables'],
      },
      {
        name: 'MilestoneType',
        table: 'milestone_types',
        description: 'Global catalogue for the milestone-type picker. Defines default colour and suggested ordering.',
        fields: ['id', 'name', 'default_color', 'suggested_ordering', 'is_active'],
        relationships: ['used by ProjectMilestone'],
      },
      {
        name: 'MilestoneDeliverable',
        table: 'milestone_deliverables',
        description: 'Per-milestone checklist (≤10 items). Completion drives Project.progress_pct unless manually overridden.',
        fields: ['id', 'milestone_id', 'sequence', 'text', 'is_complete', 'completed_at', 'completed_by_id'],
        relationships: ['belongs to ProjectMilestone (cascade)'],
      },
      {
        name: 'ProgressSnapshot',
        table: 'progress_snapshots',
        description: 'Versioned snapshot of project progress at forecast cycle close. Captures denormalised milestone descriptors + checklist payload for audit.',
        fields: ['id', 'project_id', 'cycle_id', 'current_milestone_name', 'progress_pct', 'status_narrative', 'next_milestone_confidence', 'checklist_payload_json'],
        relationships: ['belongs to Project', 'pairs with ForecastVersion (cycle type)'],
      },
      {
        name: 'ForecastVersion',
        table: 'forecast_versions',
        description: 'Immutable forecast snapshot. Created automatically on CR approval and on cycle close. version_type = cycle | cr_approval | manual. Sequential version_number per project. Stores the full mixed-granularity grid as JSON (~70 KB).',
        fields: ['id', 'project_id', 'version_number', 'version_type', 'cycle_id', 'cycle_label', 'change_request_id', 'created_by_id', 'payload_json', 'cell_count', 'total_amount_eur'],
        relationships: ['belongs to Project', 'unique on (project_id, version_number)', 'simulator scenarios anchor against this'],
      },
    ],
  },
  {
    group: 'Scenario execution audit (v5)',
    description: 'New audit rows around the simulator\'s Promote and Apply-to-Forecast flows.',
    entities: [
      {
        name: 'ScenarioAction',
        table: 'scenario_actions',
        description: 'Ordered actions within a scenario. lever_category groups by surface (forecast_grid / cost_allocation / people / rate_table / pipeline_stage / tech_navigator / milestone / etc.). tier (1/2/3) controls visibility-gating.',
        fields: ['id', 'scenario_id', 'action_type', 'lever_category', 'tier', 'parameters_json', 'sequence', 'promoted_at', 'promoted_by_id'],
        relationships: ['belongs to Scenario'],
      },
      {
        name: 'ScenarioPromotion',
        table: 'scenario_promotions',
        description: 'Per-Promote click audit row. Captures routing summary (per-action target + status), promoted/skipped counts, optional notes.',
        fields: ['id', 'scenario_id', 'promoted_at', 'promoted_by_id', 'routing_summary_json', 'promoted_count', 'skipped_count', 'notes'],
        relationships: ['belongs to Scenario'],
      },
      {
        name: 'ScenarioApplyToForecastEvent',
        table: 'scenario_apply_to_forecast_events',
        description: 'PL Apply-to-Forecast audit. Diffs carry forward into the next cycle as provisional cells (Forecast.is_provisional = true).',
        fields: ['id', 'scenario_id', 'applied_by_id', 'cycle_id', 'cycle_label', 'diffs_carried_forward', 'diffs_skipped', 'summary_json'],
        relationships: ['belongs to Scenario'],
      },
    ],
  },
  {
    group: 'Admin & governance (v5)',
    description: 'Configurable workflows, scheduled master-data changes, expanded audit log.',
    entities: [
      {
        name: 'WorkflowTemplate',
        table: 'workflow_templates',
        description: 'Configurable backing store for the six named workflows: forecast cycle, intake, change request, send-back, milestone baseline override, scheduled-change activation.',
        fields: ['id', 'workflow_id', 'name', 'description', 'version', 'is_active'],
        relationships: ['has WorkflowSteps'],
      },
      {
        name: 'WorkflowStep',
        table: 'workflow_steps',
        description: 'One step in a workflow template. Touchpoints (required, role, gates, notifications, time, escalation) are editable through the admin UI; step ordering is not.',
        fields: ['id', 'template_id', 'sequence', 'name', 'role', 'is_required', 'time_estimate_hours', 'escalation_threshold_hours'],
        relationships: ['belongs to WorkflowTemplate', 'has StepActions'],
      },
      {
        name: 'StepAction',
        table: 'step_actions',
        description: 'Concrete actions a step can perform (notify, gate, transition state). The admin UI exposes these as editable touchpoints.',
        fields: ['id', 'step_id', 'action_type', 'target', 'parameters_json'],
        relationships: ['belongs to WorkflowStep'],
      },
      {
        name: 'ScheduledChange',
        table: 'scheduled_changes',
        description: 'Pending master-data change with a 5-state lifecycle: pending_review → approved → activated / rejected / cancelled. Manual-trigger activation engine; only planning_parameter activation is wired in v5.',
        fields: ['id', 'entity_type', 'entity_id', 'field_name', 'pending_values', 'activation_date', 'description', 'state', 'created_by_person_id', 'reviewed_by_person_id', 'activated_at'],
        relationships: ['target entity varies by entity_type', 'state machine drives the lifecycle'],
      },
    ],
  },
  {
    group: 'Carried over from v4',
    description: 'Entities that survived the v5 redesign largely unchanged.',
    entities: [
      {
        name: 'Project',
        table: 'projects',
        description: 'Core entity for transformation projects. v5 added Tech Navigator scoring fields (complexity_score, value_creation_score, composite_score, tshirt_size, 6 sub-criteria), pipeline state (pipeline_stage, doi, frozen_doi, ai_council_approved, within_cutoff), and progress tracking (current_milestone_id, progress_pct, status_narrative, next_milestone_confidence).',
        fields: ['id', 'name', 'description', 'status', 'rag_status', 'is_active', 'project_type', 'transformation_level', 'composite_score', 'tshirt_size', 'pipeline_stage', 'doi', 'within_cutoff', 'progress_pct', 'next_milestone_confidence', 'pl_person_id'],
        relationships: ['linked to ChargeableEntity (1:1)', 'has ProjectMilestones', 'has ForecastVersions'],
      },
      {
        name: 'Person',
        table: 'people',
        description: 'Employees with roles, rates, and cost center assignments.',
        fields: ['id', 'name', 'email', 'role_id', 'cost_center_id', 'competence_center_id', 'location_id', 'is_active'],
        relationships: ['belongs to Cost Center + Competence Center', 'has Resource Allocations'],
      },
      {
        name: 'CostCenter',
        table: 'cost_centers',
        description: 'Organizational units that own people and budgets.',
        fields: ['id', 'code', 'name', 'location_id', 'manager_id', 'is_active'],
        relationships: ['has People', 'has Resource Requests'],
      },
      {
        name: 'Forecast',
        table: 'forecasts',
        description: 'Monthly financial data: hours / costs per project line item. v5 added is_provisional flag for cells beyond the granularity boundary (outer zone).',
        fields: ['id', 'project_id', 'line_item_type', 'line_item_id', 'year', 'month', 'baseline', 'forecast', 'actuals', 'is_capex', 'is_provisional'],
        relationships: ['belongs to Project'],
      },
      {
        name: 'ChangeRequest',
        table: 'change_requests',
        description: 'Two-stage approval workflow (CC Owner confirmation → Controller approval). On approval, automatically creates a ForecastVersion (cr_approval type).',
        fields: ['id', 'project_id', 'category', 'description', 'status', 'submitted_by', 'submitted_at', 'reviewed_by', 'reviewed_at'],
        relationships: ['belongs to Project', 'has CRChangeDetails (line-item deltas)', 'triggers ForecastVersion'],
      },
      {
        name: 'Allocation',
        table: 'allocations',
        description: 'Person × project (or chargeable entity) × month hours. v5 added chargeable_entity_id FK alongside project_id for the polymorphic refactor.',
        fields: ['id', 'project_id', 'chargeable_entity_id', 'person_id', 'month', 'hours', 'is_confirmed'],
        relationships: ['v4 callers use project_id', 'F-cluster code paths use chargeable_entity_id'],
      },
      {
        name: 'Scenario',
        table: 'scenarios',
        description: 'What-if container. v5 additions: anchor_forecast_version_id, visibility (private/tier3_only/all_users), tier3_content_flag, archived, tags, last_recalculated_at.',
        fields: ['id', 'name', 'description', 'author_id', 'status', 'anchor_forecast_version_id', 'visibility', 'archived', 'tags', 'last_recalculated_at'],
        relationships: ['has ScenarioActions', 'audited by ScenarioPromotions + ScenarioApplyToForecastEvents'],
      },
      {
        name: 'RateTable',
        table: 'rates',
        description: 'Hourly cost rates by role and competence center with effective dates for historical accuracy.',
        fields: ['id', 'role_id', 'competence_center_id', 'hourly_rate', 'effective_from'],
        relationships: ['belongs to RoleType + CompetenceCenter'],
      },
      {
        name: 'AuditLog',
        table: 'audit_log',
        description: 'Entity audit trail. v5 expanded to 8 categories: master_data, configuration, hierarchy, forecast_actions, pipeline_transitions, simulator, access_control, scheduled_change_lifecycle. category column is required at every write site.',
        fields: ['id', 'entity_type', 'entity_id', 'category', 'action', 'old_value', 'new_value', 'actor_id', 'timestamp'],
        relationships: ['filterable by category in Admin → Audit Log'],
      },
      {
        name: 'Notification',
        table: 'notifications',
        description: 'In-app alerts with deep links and persona differentiation.',
        fields: ['id', 'recipient_role', 'recipient_person_id', 'message', 'type', 'is_read', 'deep_link', 'created_at'],
        relationships: ['targets a Role or Person'],
      },
    ],
  },
];

interface EntityDef {
  name: string;
  table: string;
  description: string;
  fields: string[];
  relationships: string[];
}

const SEED_SUMMARY = [
  { entity: 'Chargeable Entities', count: '34', note: '11 Project + 6 Offering + 17 InternalService' },
  { entity: 'Distribution Edges', count: '39', note: 'Stage 1 inter-service flows (forecast version)' },
  { entity: 'BTC Profiles', count: '27', note: '15 manual + 12 automatic; year 2026' },
  { entity: 'BTC Profile Lines', count: '~270', note: 'Sparse — only non-zero cells' },
  { entity: 'Charging Locations', count: '~90', note: 'KB internal charging codes' },
  { entity: 'Legal Entities', count: '~120', note: 'Many-to-one rollup to ChargingLocation' },
  { entity: 'UM Cells', count: '312', note: 'User Measurement matrix (sparse)' },
  { entity: 'Personas', count: '4', note: 'Anna Meier · Thomas Brenner · Priya Sharma · Dr. Klaus Weber' },
  { entity: 'Pre-built Scenarios', count: '3', note: 'Incl. MDH BTC Rebalance flagship (lever-12)' },
  { entity: 'Workflow Templates', count: '4', note: '16 steps total; 6 named workflows backed' },
  { entity: 'Project Milestones', count: '~30', note: 'With baseline + forecast date ranges' },
  { entity: 'Milestone Deliverables', count: '~20', note: '≤10 per milestone; drives progress %' },
  { entity: 'Progress Snapshots', count: '~10', note: 'Captured at cycle close' },
  { entity: 'Forecast Versions', count: '2 per project', note: 'Q1 2026 + Q2 2026 cycles' },
  { entity: 'Notifications', count: '19', note: 'Persona-differentiated' },
  { entity: 'Demo Date', count: 'April 2026', note: 'All time-dependent logic anchored here' },
];

export function DataModelTab() {
  return (
    <div className="space-y-6 mt-4">
      {/* v5 Hierarchy callout */}
      <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-primary">v5 redesign — the hierarchy is now configurable</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground space-y-2">
          <p>
            v5 retired the rigid <code className="text-xs">LineOfBusiness</code> and <code className="text-xs">Programme</code> master tables. Portfolio hierarchy is
            now a <strong>configurable n-level node graph</strong>:
          </p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
            <li><code className="text-xs">GroupingEntityType</code> defines the kinds of levels (Line of Business, Programme, custom).</li>
            <li><code className="text-xs">GroupingEntity</code> rows are the nodes themselves.</li>
            <li><code className="text-xs">GroupingHierarchy</code> rows form the parent-child edges between nodes.</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Controllers can rename or add levels from <strong>Admin → Hierarchy</strong> without a code change. The label
            propagates to every module (Portfolio tree, Workbench breadcrumb, Backlog filters, Reporting groupings).
          </p>
        </CardContent>
      </Card>

      {/* ER Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entity Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            v5 reshapes the data model around a <strong>polymorphic ChargeableEntity</strong> root that
            unifies Projects, Offerings, and Internal Services. Cost flows in two stages — Stage 1
            inter-service distribution edges and Stage 2 BTC profiles — with a two-layer rollup cache
            on top. The portfolio hierarchy is no longer a static LoB → Programme spine; it's a
            configurable node graph (see callout above).
          </p>

          <div className="font-mono text-xs bg-muted/50 rounded-lg p-4 text-foreground leading-relaxed whitespace-pre">{`Configurable hierarchy            Cost-allocation flow
─────────────────────             ──────────────────────────────
GroupingEntityType                ChargeableEntity (Project/Offering/InternalService)
   │                                │
   v                                │ outgoing
GroupingEntity ←──────────────────  │   │
   │   ▲                            │   │ percentage edge
   │   │ parent_id                  │   ▼
   │   │ (GroupingHierarchy)        Distribution → ChargeableEntity (downstream)
   │                                │
   │ hierarchy_node_id              │ effective cost = own + Σ inflows
   │ (attaches into the graph)      │                  │
   ▼                                ▼                  ▼
ChargeableEntity              BTCProfile          RollupCache
   │                          (Stage 2)           ─ stage1_effective
   │                              │               ─ stage2_location
   │                              ▼
   │                          BTCProfileLine ──── ChargingLocation
   │                                                  │
   │                                                  ▼
   │                                              LegalEntity (1:N rollup)
   │
   ├── Project ──── ForecastVersion (immutable; cycle / cr_approval / manual)
   │                  payload_json = full mixed-granularity grid
   ├── ProjectMilestone ──── MilestoneDeliverable (≤10)
   │                                  │
   │                                  ▼
   │                          ProgressSnapshot (per cycle)
   │
   ├── Allocation (person × month × hours) ──── Person ──── CostCenter
   │
   └── Scenario ──── ScenarioAction[]
                          │
                          ├── ScenarioPromotion (audit per Promote)
                          └── ScenarioApplyToForecastEvent (PL audit)

Admin & governance
──────────────────
WorkflowTemplate ──── WorkflowStep ──── StepAction
ScheduledChange (5-state lifecycle)
AuditLog (8 categories)`}</div>
        </CardContent>
      </Card>

      {/* Entity Reference — grouped */}
      {ENTITY_GROUPS.map((group) => (
        <Card key={group.group}>
          <CardHeader>
            <CardTitle className="text-lg">{group.group}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.entities.map((entity) => (
              <div key={entity.table} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground">{entity.name}</span>
                  <Badge variant="outline" className="text-xs font-mono">{entity.table}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{entity.description}</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {entity.fields.map((f) => (
                    <span key={f} className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {f}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {entity.relationships.map((r, i) => (
                    <span key={i}>
                      {i > 0 && ' · '}
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Seed Data Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Seed Data Summary (v5 S1 reconstruction)</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-muted-foreground font-medium">Entity</th>
                <th className="text-left py-2 text-muted-foreground font-medium">Count</th>
                <th className="text-left py-2 text-muted-foreground font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {SEED_SUMMARY.map((row) => (
                <tr key={row.entity} className="border-b last:border-0">
                  <td className="py-2 font-medium text-foreground">{row.entity}</td>
                  <td className="py-2 text-muted-foreground font-mono text-xs">{row.count}</td>
                  <td className="py-2 text-muted-foreground text-xs">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Financial Data Model */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Financial Data Model</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground space-y-3">
          <p>Each project has three layers of financial data per month:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li><strong>Baseline</strong> — original approved budget (set at project approval, updated by approved CRs).</li>
            <li><strong>Forecast</strong> — current expected spend (updated via the 5-phase forecast cycle wizard or by approved CRs).</li>
            <li><strong>Actuals</strong> — recorded spend to date (terminates at the demo date boundary: April 2026).</li>
          </ul>
          <p>
            v5 introduces a <strong>mixed-granularity grid</strong> per <code className="text-xs">[C-FG-01..07]</code>: cells inside the granularity boundary are
            monthly; cells outside are quarterly with <code className="text-xs">is_provisional = true</code>. A 5-phase Forecast Cycle wizard
            replaces the v4 ad-hoc forecast edits.
          </p>
          <p>
            Every approved CR and every cycle close creates an immutable <strong>ForecastVersion</strong> snapshot
            (~70 KB JSON payload). Scenarios anchor against an explicit version rather than rebasing — see the
            simulator manual for the apply-to-forecast and promote flows.
          </p>
          <p>
            Line items are categorised as <strong>internal resources</strong> (person allocations with hours and
            derived EUR costs via rate tables) or <strong>external costs</strong> (consulting, cloud,
            licenses, etc., sourced from <code className="text-xs">ExternalCostType</code>). Each line item carries a
            CapEx / OpEx classification.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
