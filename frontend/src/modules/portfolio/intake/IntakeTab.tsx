import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { portfolioApi } from '@/api/endpoints';
import { IntakeTable } from './IntakeTable';
import { IntakeDetailPanel } from './IntakeDetailPanel';
import { IntakeDetailWorkspace } from './IntakeDetailWorkspace';
import type { IntakeItem } from '@/types/api';

export function IntakeTab() {
  const { currentRoleId } = useRole();
  const { openPanel, closePanel } = useSidePanel();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    portfolioApi
      .getIntake()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchItems();
  }, [currentRoleId, fetchItems]);

  const handleOpenDetail = useCallback(
    (projectId: string) => {
      setDetailProjectId(projectId);
      closePanel();
    },
    [closePanel],
  );

  // Auto-select project from URL deep-link (?project=...)
  useEffect(() => {
    const projectId = searchParams.get('project');
    if (!projectId || deepLinkHandled.current || items.length === 0) return;
    const match = items.find((i) => i.project_id === projectId);
    if (match) {
      deepLinkHandled.current = true;
      setSelectedId(projectId);
      openPanel(
        'Submission Detail',
        <IntakeDetailPanel
          projectId={projectId}
          onActionComplete={() => {
            fetchItems();
            closePanel();
            setSelectedId(undefined);
          }}
          onOpenDetail={handleOpenDetail}
        />,
      );
      // Clean up the URL param
      searchParams.delete('project');
      setSearchParams(searchParams, { replace: true });
    }
  }, [items, searchParams, setSearchParams, openPanel, closePanel, fetchItems, handleOpenDetail]);

  const handleSelect = useCallback(
    (projectId: string) => {
      if (selectedId === projectId) {
        setSelectedId(undefined);
        closePanel();
      } else {
        setSelectedId(projectId);
        openPanel(
          'Submission Detail',
          <IntakeDetailPanel
            projectId={projectId}
            onActionComplete={() => {
              fetchItems();
              closePanel();
              setSelectedId(undefined);
            }}
            onOpenDetail={handleOpenDetail}
          />,
        );
      }
    },
    [selectedId, openPanel, closePanel, fetchItems, handleOpenDetail],
  );

  if (detailProjectId) {
    return (
      <IntakeDetailWorkspace
        projectId={detailProjectId}
        onBack={() => setDetailProjectId(null)}
        onActionComplete={() => {
          setDetailProjectId(null);
          fetchItems();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <IntakeTable
        items={items}
        loading={loading}
        selectedId={selectedId}
        onSelect={handleSelect}
        onOpenDetail={handleOpenDetail}
      />
    </div>
  );
}
