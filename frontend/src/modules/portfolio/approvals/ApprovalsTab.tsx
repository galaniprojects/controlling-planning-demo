import { useEffect, useState, useCallback } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { portfolioApi } from '@/api/endpoints';
import { ApprovalsTable } from './ApprovalsTable';
import { CRDetailPanel } from './CRDetailPanel';
import { CRDetailWorkspace } from './CRDetailWorkspace';
import type { ApprovalItem } from '@/types/api';

export function ApprovalsTab() {
  const { currentRoleId } = useRole();
  const { openPanel, closePanel } = useSidePanel();

  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [detailCrId, setDetailCrId] = useState<number | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    portfolioApi
      .getApprovals()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchItems();
  }, [currentRoleId, fetchItems]);

  const handleOpenDetail = useCallback(
    (crId: number) => {
      setDetailCrId(crId);
      closePanel();
    },
    [closePanel],
  );

  const handleSelect = useCallback(
    (crId: number) => {
      if (selectedId === crId) {
        setSelectedId(undefined);
        closePanel();
      } else {
        setSelectedId(crId);
        openPanel(
          'Change Request Detail',
          <CRDetailPanel
            crId={crId}
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

  if (detailCrId) {
    return (
      <CRDetailWorkspace
        crId={detailCrId}
        onBack={() => setDetailCrId(null)}
        onActionComplete={() => {
          setDetailCrId(null);
          fetchItems();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ApprovalsTable
        items={items}
        loading={loading}
        selectedId={selectedId}
        onSelect={handleSelect}
        onOpenDetail={handleOpenDetail}
      />
    </div>
  );
}
