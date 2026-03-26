import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { portfolioApi, referenceApi } from '@/api/endpoints';
import { useActiveHierarchy } from '@/hooks/useActiveHierarchy';
import { FilterBar, type FilterConfig } from '@/components/shared/FilterBar';
import { PortfolioKPIRow } from './PortfolioKPIRow';
import { PortfolioTree } from './PortfolioTree';
import { ProjectSummaryPanel } from './ProjectSummaryPanel';
import { DashboardCharts } from './DashboardCharts';
import type { PortfolioKPIs, ProjectTreeNode, ChartData, LoBRef } from '@/types/api';

const RAG_OPTIONS = [
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'red', label: 'Red' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'planned', label: 'Planned' },
  { value: 'completed', label: 'Completed' },
];

const TYPE_OPTIONS = [
  { value: 'project', label: 'Project' },
  { value: 'service', label: 'Service' },
];

export function DashboardTab() {
  const { currentRoleId } = useRole();
  const { openPanel, closePanel } = useSidePanel();
  const location = useLocation();
  const { topLevelLabel, entityOptions, filterKey } = useActiveHierarchy();

  const [kpis, setKpis] = useState<PortfolioKPIs | null>(null);
  const [tree, setTree] = useState<ProjectTreeNode[]>([]);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [lobs, setLobs] = useState<LoBRef[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();

  const [filters, setFilters] = useState<Record<string, string>>({
    grouping_entity: '',
    status: '',
    rag: '',
    type: '',
  });

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

  // Handle deep link from notifications (e.g. /portfolio/proj-erp2)
  useEffect(() => {
    const pathParts = location.pathname.split('/');
    // /portfolio/someProjectId
    if (pathParts.length >= 3 && pathParts[2] && pathParts[2] !== 'intake' && pathParts[2] !== 'approvals') {
      setSelectedProjectId(pathParts[2]);
    }
  }, [location.pathname]);

  // Open side panel when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      openPanel(
        'Project Summary',
        <ProjectSummaryPanel projectId={selectedProjectId} />,
      );
    }
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProjectSelect = useCallback(
    (node: ProjectTreeNode) => {
      if (selectedProjectId === node.id) {
        setSelectedProjectId(undefined);
        closePanel();
      } else {
        setSelectedProjectId(node.id);
      }
    },
    [selectedProjectId, closePanel],
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
