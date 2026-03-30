import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const MODULES = [
  { name: 'Launchpad', route: '/launchpad', description: 'Home screen with role-aware notifications, pending actions with deep-linking, module tiles, dark mode toggle, project submission' },
  { name: 'Portfolio Overview', route: '/portfolio', description: 'KPI dashboard, project tree, intake queue with editable grid and diff view, change request approvals' },
  { name: 'Project Workbench', route: '/workbench', description: 'Master-detail project view, forecast grid, rolling forecast wizard, project submission workflow, change history' },
  { name: 'Capacity Management', route: '/capacity', description: 'Team utilization heatmaps, cell drill-down, org overview, resource requests' },
  { name: 'What-If Simulator', route: '/simulator', description: 'Scenario planning with 12 action types, impact dashboard, AI Advisor' },
  { name: 'Reporting', route: '/reporting', description: 'Report Library (5 standard reports), Report Builder (OLAP-style custom reports), AI Report Builder (natural language), sharing & publishing' },
  { name: 'Administration', route: '/admin', description: 'Entity management, portfolio hierarchy, rate tables, planning parameters, audit log' },
];

const TECH_STACK = [
  { layer: 'Backend', tech: 'Python 3.12, FastAPI, SQLAlchemy ORM, Pydantic' },
  { layer: 'Frontend', tech: 'React, TypeScript, Vite, Tailwind CSS' },
  { layer: 'UI Components', tech: 'shadcn/ui (Radix UI primitives)' },
  { layer: 'Charts', tech: 'Recharts' },
  { layer: 'Database', tech: 'SQLite (embedded, demo)' },
];

export function OverviewTab() {
  return (
    <div className="space-y-6 mt-4">
      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">About CRETA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-foreground">
          <p>
            <strong>CRETA</strong> (Controlling, Reporting, Estimation, Tracking & Allocations) is an IT financial
            planning and portfolio management application. It provides end-to-end project portfolio
            visibility, capacity management, what-if scenario planning, and multi-dimensional reporting.
          </p>
          <p>
            This is a <strong>demo application</strong> with realistic mock data simulating an April 2026 operational
            date. All financial values use EUR with European formatting (dot for thousands, comma for decimals).
          </p>
        </CardContent>
      </Card>

      {/* Module Map */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Modules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {MODULES.map((mod) => (
              <div key={mod.route} className="border rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{mod.name}</span>
                  <Badge variant="outline" className="text-xs font-mono">{mod.route}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{mod.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Architecture */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Architecture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="font-mono text-xs bg-muted/50 rounded-lg p-4 text-foreground leading-relaxed whitespace-pre">{`Browser (React SPA)
    |
    |  HTTP (JSON)
    |  All requests include X-Current-User header
    v
Vite Dev Server (:5173)
    |
    |  Proxy /api/* requests
    v
FastAPI Backend (:8000)
    |
    |  SQLAlchemy ORM
    v
SQLite Database (creta_demo.db)
    |
    Seed data: seed.sql + JSON fixtures`}</div>

          <div className="text-sm text-foreground space-y-2">
            <p><strong>Key architectural rules:</strong></p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Server-side computation — frontend receives ready-to-render data</li>
              <li>SQLAlchemy ORM for all database access (no raw SQL in application code)</li>
              <li>Deactivation pattern (is_active flag), never deletion</li>
              <li>Rate tables with effective dates for historical cost calculations</li>
              <li>Consistent response shapes: {'{ items: [...], total: N }'} for lists</li>
              <li>Role-based access via X-Current-User header on every request</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Tech Stack */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tech Stack</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-muted-foreground font-medium">Layer</th>
                <th className="text-left py-2 text-muted-foreground font-medium">Technology</th>
              </tr>
            </thead>
            <tbody>
              {TECH_STACK.map((row) => (
                <tr key={row.layer} className="border-b last:border-0">
                  <td className="py-2 font-medium text-foreground">{row.layer}</td>
                  <td className="py-2 text-muted-foreground">{row.tech}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Demo Personas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Demo Personas</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-muted-foreground font-medium">Persona</th>
                <th className="text-left py-2 text-muted-foreground font-medium">Role</th>
                <th className="text-left py-2 text-muted-foreground font-medium">Key Access</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b"><td className="py-2 font-medium">Anna Meier</td><td className="py-2">Controller</td><td className="py-2 text-muted-foreground">Full access — all modules, admin, approvals, scenarios</td></tr>
              <tr className="border-b"><td className="py-2 font-medium">Thomas Brenner</td><td className="py-2">CC Owner</td><td className="py-2 text-muted-foreground">Capacity management, portfolio dashboard</td></tr>
              <tr className="border-b"><td className="py-2 font-medium">Priya Sharma</td><td className="py-2">Project Lead</td><td className="py-2 text-muted-foreground">Project workbench, forecast cycles, intake submission</td></tr>
              <tr className="border-0"><td className="py-2 font-medium">Thomas Becker</td><td className="py-2">Executive</td><td className="py-2 text-muted-foreground">Portfolio dashboard, scenarios (read-only)</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
