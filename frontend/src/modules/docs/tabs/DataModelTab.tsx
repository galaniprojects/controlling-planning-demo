import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ENTITIES = [
  {
    name: 'Project',
    table: 'projects',
    description: 'Core entity — IT projects and services with lifecycle, budget, RAG status, and submission workflow state.',
    fields: ['id', 'name', 'description', 'status', 'rag_status', 'is_service', 'is_active', 'lob_id', 'programme_id', 'start_date', 'end_date', 'start_month', 'end_month', 'project_manager_id', 'pl_person_id', 'capex_opex', 'submission_feedback'],
    relationships: ['belongs to LoB', 'belongs to Programme', 'has Forecast rows', 'has Change Requests', 'has Resource Allocations', 'has Submission Snapshots'],
  },
  {
    name: 'Person',
    table: 'people',
    description: 'Employees with roles, rates, and cost center assignments.',
    fields: ['id', 'name', 'email', 'role_id', 'cost_center_id', 'competence_center_id', 'location_id', 'is_active'],
    relationships: ['belongs to Cost Center', 'belongs to Competence Center', 'has Resource Allocations', 'has Rate history'],
  },
  {
    name: 'Cost Center',
    table: 'cost_centers',
    description: 'Organizational units that own people and budgets.',
    fields: ['id', 'code', 'name', 'location_id', 'manager_id', 'is_active'],
    relationships: ['has People', 'belongs to Location', 'has Resource Requests'],
  },
  {
    name: 'Line of Business (LoB)',
    table: 'lines_of_business',
    description: 'Business segments that group related projects.',
    fields: ['id', 'code', 'name', 'is_active'],
    relationships: ['has Projects'],
  },
  {
    name: 'Forecast',
    table: 'forecasts',
    description: 'Monthly financial data: baseline, forecast, and actuals for each project line item.',
    fields: ['id', 'project_id', 'line_item_type', 'line_item_id', 'year', 'month', 'baseline', 'forecast', 'actuals', 'is_capex'],
    relationships: ['belongs to Project'],
  },
  {
    name: 'Change Request (CR)',
    table: 'change_requests',
    description: 'Formal budget change proposals that flow through an approval workflow.',
    fields: ['id', 'project_id', 'category', 'description', 'status', 'submitted_by', 'submitted_at', 'reviewed_by', 'reviewed_at'],
    relationships: ['belongs to Project', 'has CR Line Items (before/after values)'],
  },
  {
    name: 'Resource Allocation',
    table: 'resource_allocations',
    description: 'Person-to-project assignments with monthly hours.',
    fields: ['id', 'project_id', 'person_id', 'role_id', 'start_month', 'end_month', 'hours_per_month'],
    relationships: ['belongs to Project', 'belongs to Person'],
  },
  {
    name: 'Resource Request',
    table: 'resource_requests',
    description: 'Requests from project leads to cost center owners for resource allocation.',
    fields: ['id', 'project_id', 'cost_center_id', 'role_id', 'status', 'hours_per_month', 'start_month', 'end_month'],
    relationships: ['belongs to Project', 'belongs to Cost Center'],
  },
  {
    name: 'Scenario',
    table: 'scenarios',
    description: 'What-if scenarios with applied actions and computed portfolio impact.',
    fields: ['id', 'name', 'description', 'owner_id', 'status', 'is_published', 'created_at'],
    relationships: ['has Scenario Actions', 'owned by Persona'],
  },
  {
    name: 'Rate Table',
    table: 'rates',
    description: 'Hourly cost rates by role and competence center with effective dates.',
    fields: ['id', 'role_id', 'competence_center_id', 'hourly_rate', 'effective_from'],
    relationships: ['belongs to Role Type', 'belongs to Competence Center'],
  },
  {
    name: 'Project Submission Snapshot',
    table: 'project_submission_snapshots',
    description: 'Stores forecast snapshots for the submission workflow — captures the original submission and controller-proposed changes for diff comparison.',
    fields: ['id', 'project_id', 'snapshot_type', 'snapshot_data (JSON)', 'created_at'],
    relationships: ['belongs to Project'],
  },
  {
    name: 'Notification',
    table: 'notifications',
    description: 'In-app notifications for workflow events (submissions, approvals, change requests) with deep links.',
    fields: ['id', 'recipient_role', 'message', 'type', 'is_read', 'deep_link', 'deep_link_tab', 'created_at'],
    relationships: ['targets a Role'],
  },
  {
    name: 'Grouping Hierarchy',
    table: 'grouping_hierarchies',
    description: 'Configurable portfolio grouping structure (e.g., LoB hierarchy). Labels propagate across all modules.',
    fields: ['id', 'name', 'is_active', 'levels (JSON)'],
    relationships: ['has Entity Types', 'has Entities', 'has Entity-Project assignments'],
  },
];

const SEED_SUMMARY = [
  { entity: 'Projects', count: '32', note: 'Across 4 LoBs (TBS, RVS, CIT, DND)' },
  { entity: 'Active People', count: '~52', note: 'Roles: Developer, Sr Developer, Architect, PM, Analyst, etc.' },
  { entity: 'Cost Centres', count: '10', note: '3 locations: Munich, Budapest, Pune' },
  { entity: 'Lines of Business', count: '4', note: 'Truck & Bus, Rail Vehicle, Corporate IT, Digital & Data' },
  { entity: 'Competence Centers', count: 'Multiple', note: 'With blended hourly rates' },
  { entity: 'Change Requests', count: '~14', note: 'With traceable before/after values' },
  { entity: 'Pre-built Scenarios', count: '3', note: '2 published, 1 private' },
  { entity: 'Forecast Snapshots', count: '117', note: 'For forecast accuracy reporting' },
  { entity: 'Data Range', count: '2021-06 to 2029-06', note: '9 fiscal years' },
];

export function DataModelTab() {
  return (
    <div className="space-y-6 mt-4">
      {/* ER Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entity Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            The data model centers around <strong>Projects</strong>, which have <strong>Forecast</strong> rows
            (monthly baseline/forecast/actuals), <strong>Resource Allocations</strong> (person assignments),
            and <strong>Change Requests</strong> (budget change proposals). Projects belong to a
            <strong> Line of Business</strong> and optionally a <strong>Programme</strong>. People belong to
            <strong> Cost Centers</strong> and <strong>Competence Centers</strong> with location-aware rate tables.
          </p>

          <div className="font-mono text-xs bg-muted/50 rounded-lg p-4 text-foreground leading-relaxed whitespace-pre">{`Project ──── LoB
   │  ╰───── Programme
   │
   ├── Forecast (monthly: baseline/forecast/actuals)
   ├── Resource Allocation ──── Person ──── Cost Center ──── Location
   │                              ╰───── Competence Center
   ├── Change Request
   │      ╰── CR Line Items (before/after/delta)
   ├── Submission Snapshot (original + controller_proposed)
   ╰── Resource Request ──── Cost Center

Notification ──── Role (recipient)
Scenario ──── Scenario Action[]
Grouping Hierarchy ──── Entity Types ──── Entities ──── Projects`}</div>
        </CardContent>
      </Card>

      {/* Entity Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entity Reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ENTITIES.map((entity) => (
            <div key={entity.table} className="border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
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

      {/* Seed Data Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Seed Data Summary</CardTitle>
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
          <p>
            Each project has three layers of financial data per month:
          </p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li><strong>Baseline</strong> — original approved budget (set at project approval, updated by approved CRs)</li>
            <li><strong>Forecast</strong> — current expected spend (updated via rolling forecast wizard)</li>
            <li><strong>Actuals</strong> — recorded spend to date (terminates at demo date boundary: April 2026)</li>
          </ul>
          <p>
            Line items are categorized as <strong>internal resources</strong> (person allocations with hours and derived EUR costs
            via rate tables) or <strong>external costs</strong> (consulting, licenses, cloud, etc.). Each line item carries
            a <strong>CapEx/OpEx</strong> classification.
          </p>
          <p>
            <strong>Change Requests</strong> capture proposed budget changes with before/after values per line item.
            They flow through an approval workflow: <code>pending_approval</code> → <code>approved</code> / <code>rejected</code> / <code>changes_requested</code>.
          </p>
          <p>
            <strong>Submission Workflow:</strong> New projects follow a lifecycle (<code>draft</code> → <code>pending_cc_confirmation</code> → <code>pending_approval</code> → <code>active</code>).
            Controllers can request changes via an editable forecast grid, which creates a <code>controller_proposed</code> snapshot.
            The Project Lead sees a diff view comparing the original submission against the controller's proposed changes,
            and can accept or edit and resubmit. Snapshots are stored in the <code>project_submission_snapshots</code> table.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
