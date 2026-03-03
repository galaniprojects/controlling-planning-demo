import { useEffect, useState, useCallback } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { portfolioApi } from '@/api/endpoints';
import { ApprovalsTable } from './ApprovalsTable';
import { CRDetailPanel } from './CRDetailPanel';
import type { ApprovalItem } from '@/types/api';

export function ApprovalsTab() {
  const { currentRoleId } = useRole();
  const { openPanel, closePanel } = useSidePanel();

  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | undefined>();

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
          />,
        );
      }
    },
    [selectedId, openPanel, closePanel, fetchItems],
  );

  return (
    <div className="space-y-4">
      <ApprovalsTable
        items={items}
        loading={loading}
        selectedId={selectedId}
        onSelect={handleSelect}
      />
    </div>
  );
}
