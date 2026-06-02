import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { portfolioApi, referenceApi } from '@/api/endpoints';
import { useActiveHierarchy } from '@/hooks/useActiveHierarchy';
import { FilterBar, type FilterConfig } from '@/components/shared/FilterBar';
import { PortfolioKPIRow } from './PortfolioKPIRow';
import { PortfolioTree } from './PortfolioTree';
import { DashboardCharts } from './DashboardCharts';
// E6: dashboard scroll/filter handshake for back-button restoration.
import {
  captureDashboardSnapshot,
  readDashboardSnapshot,
  clearDashboardSnapshot,
} from '../detail/ProjectDetailPage';
import type { PortfolioKPIs, ProjectTreeNode, ChartData, LoBRef } from '@/types/api';

const RAG_OPTIONS = [
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'red', label: 'Red' },
];

// Values must match Project.pipeline_stage exactly — the backend filters
// `pipeline_stage == status`. (Legacy lowercase status values were retired.)
const STATUS_OPTIONS = [
  { value: 'Approved', label: 'Approved' },
  { value: 'Active', label: 'Active' },
  { value: 'Hyper-maintenance', label: 'Hyper-maintenance' },
  { value: 'Completed', label: 'Completed' },
];

const TYPE_OPTIONS = [
  { value: 'project', label: 'Project' },
  { value: 'service', label: 'Service' },
];

export function DashboardTab() {
  const { currentRoleId } = useRole();
  const location = useLocation();
  const navigate = useNavigate();
  const { topLevelLabel, entityOptions, filterKey } = useActiveHierarchy();

  const [kpis, setKpis] = useState<PortfolioKPIs | null>(null);
  const [tree, setTree] = useState<ProjectTreeNode[]>([]);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [lobs, setLobs] = useState<LoBRef[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();

  // E6: hydrate filters from the dashboard snapshot (set when navigating
  // into the project detail page) on first mount, then clear it.
  const initialFilters = (() => {
    const snap = readDashboardSnapshot();
    return (
      snap?.filters ?? {
        grouping_entity: '',
        status: '',
        rag: '',
        type: '',
      }
    );
  })();
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);

  // Load reference data (LoBs for filter)
  useEffect(() => {
    referenceApi.getLobs().then((res) => setLobs(res.items)).catch(() => {});
  }, []);

  // Reset filters when filterKey changes (e.g. hierarchy activated/deactivated)
  useEffect(() => {
    setFilters({ [filterKey]: '', status: '', rag: '', type: '' });
  }, [filterKey]);

  // Load data when role or filters change
  useEffect(() => {
    const params: Record<string, string> = {};
    if (filters[filterKey]) params[filterKey] = filters[filterKey];
    if (filters.status) params.status = filters.status;
    if (filters.rag) params.rag = filters.rag;
    if (filters.type) params.type = filters.type;

    portfolioApi.getKPIs(params).then(setKpis).catch(() => {});

    setTreeLoading(true);
    portfolioApi
      .getProjects(params)
      .then((res) => setTree(res.items))
      .catch(() => setTree([]))
      .finally(() => setTreeLoading(false));

    portfolioApi
      .getCharts(filters)
      .then(setCharts)
      .catch(() => {});
  }, [currentRoleId, filters]);

  // E6: deep-link backwards-compat — `/portfolio/<projectId>` was the v4
  // slide-in trigger. Redirect those URLs to the new full-page detail
  // route. Anything matching /portfolio/{intake,approvals,run,project,...}
  // is owned by another route and bypassed.
  useEffect(() => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const RESERVED = new Set([
      'intake',
      'approvals',
      'run',
      'project',
      'dashboard',
      'external-spend',
    ]);
    if (
      pathParts.length === 2 &&
      pathParts[0] === 'portfolio' &&
      !RESERVED.has(pathParts[1])
    ) {
      navigate(`/portfolio/project/${pathParts[1]}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  // E6: restore scroll position after the snapshot was set on departure.
  useEffect(() => {
    const snap = readDashboardSnapshot();
    if (snap) {
      // Defer until after layout settles
      requestAnimationFrame(() => {
        window.scrollTo({ top: snap.scrollY, left: 0 });
        clearDashboardSnapshot();
      });
    }
  }, []);

  const handleProjectSelect = useCallback(
    (node: ProjectTreeNode) => {
      // E6: capture scroll + filters so the back button can restore them,
      // then navigate to the full-page detail per [E-03b].
      captureDashboardSnapshot(filters);
      setSelectedProjectId(node.id);
      navigate(`/portfolio/project/${node.id}`);
    },
    [navigate, filters],
  );

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleFilterClear = useCallback(() => {
    setFilters({ [filterKey]: '', status: '', rag: '', type: '' });
  }, [filterKey]);

  const handleRagClick = useCallback((rag: string) => {
    setFilters((prev) => ({ ...prev, rag: prev.rag === rag ? '' : rag }));
  }, []);

  const filterConfigs: FilterConfig[] = [
    {
      key: filterKey,
      label: topLevelLabel,
      options: entityOptions.length > 0 ? entityOptions : lobs.map((l) => ({ value: l.id, label: l.name })),
    },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS },
    { key: 'rag', label: 'RAG', options: RAG_OPTIONS },
    { key: 'type', label: 'Type', options: TYPE_OPTIONS },
  ];

  return (
    <div className="space-y-5">
      <PortfolioKPIRow data={kpis} />
      <FilterBar
        filters={filterConfigs}
        values={filters}
        onChange={handleFilterChange}
        onClear={handleFilterClear}
      />
      <PortfolioTree
        data={tree}
        loading={treeLoading}
        selectedId={selectedProjectId}
        onProjectSelect={handleProjectSelect}
      />
      <DashboardCharts data={charts} activeRag={filters.rag || null} onRagClick={handleRagClick} />
    </div>
  );
}
