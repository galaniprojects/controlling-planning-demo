import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { capacityApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import type { CapacityRequestItem } from '@/types/api';
import { RequestListPanel } from './RequestListPanel';
import { RequestDetail } from './RequestDetail';
import { AvailabilityContext } from './AvailabilityContext';
import { RequestActionBar } from './RequestActionBar';
import { ProjectConfirmationBanner } from './ProjectConfirmationBanner';

interface RequestManagementProps {
  ccId: string;
}

export function RequestManagement({ ccId }: RequestManagementProps) {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<CapacityRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const fetchRequests = () => {
    if (!ccId) return;
    setLoading(true);
    capacityApi
      .getRequests(ccId)
      .then((res) => {
        setRequests(res.items);
        // Auto-select first pending if nothing selected
        if (selectedId === null && res.items.length > 0) {
          const first = res.items.find((r) => r.status === 'pending') ?? res.items[0];
          setSelectedId(first.id);
        }
      })
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequests();
  }, [ccId]);

  const selectedRequest = requests.find((r) => r.id === selectedId) ?? null;

  const handleActionComplete = () => {
    setSelectedPersonId(null);
    fetchRequests();
  };

  const handleSelect = (id: number) => {
    setSelectedId(id);
    setSelectedPersonId(null);
  };

  if (!ccId) {
    return (
      <p className="text-sm text-muted-foreground">
        No cost center available for request management.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => navigate('/capacity')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Capacity Management
      </button>

      <ProjectConfirmationBanner onConfirmComplete={fetchRequests} />

      <div className="flex rounded-md border border-border bg-card" style={{ height: 'calc(100vh - 240px)' }}>
        {loading ? (
          <div className="p-4 space-y-3 w-full">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <RequestListPanel
              requests={requests}
              selectedId={selectedId}
              onSelect={handleSelect}
              collapsed={collapsed}
              onToggleCollapse={() => setCollapsed((c) => !c)}
            />

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedRequest ? (
                <>
                  <RequestDetail
                    request={selectedRequest}
                    onProjectClick={() =>
                      navigate(`/workbench?project=${selectedRequest.project_id}`)
                    }
                  />

                  <AvailabilityContext
                    ccId={ccId}
                    request={selectedRequest}
                    selectedPersonId={selectedPersonId}
                    onSelectPerson={setSelectedPersonId}
                  />

                  <RequestActionBar
                    ccId={ccId}
                    request={selectedRequest}
                    selectedPersonId={selectedPersonId}
                    onActionComplete={handleActionComplete}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a request from the list to view details.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
