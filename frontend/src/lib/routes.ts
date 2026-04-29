export const MODULE_ROUTES: Record<string, string> = {
  portfolio: '/portfolio',
  workbench: '/workbench',
  capacity: '/capacity',
  simulator: '/simulator',
  reporting: '/reporting',
  admin: '/admin',
  documentation: '/docs',
  backlog: '/backlog',
};

export const ROUTE_LABELS: Record<string, string> = {
  '/': 'Launchpad',
  '/portfolio': 'Portfolio Overview',
  '/portfolio/intake': 'Intake Queue',
  '/portfolio/approvals': 'Approvals',
  '/workbench': 'Project Workbench',
  '/capacity': 'Capacity Management',
  '/capacity/requests': 'Resource Requests',
  '/simulator': 'What-If Simulator',
  '/reporting': 'Reporting',
  '/reporting/builder': 'Report Builder',
  '/admin': 'Administration',
  '/docs': 'Documentation',
  // === Backlog (A6) ===
  '/backlog': 'Backlog',
};
