import { useState, useEffect } from 'react';
import { FilterBar } from '@/components/shared/FilterBar';
import { Skeleton } from '@/components/shared/Skeleton';
import { workbenchApi } from '@/api/endpoints';
import type { CRHistoryItem } from '@/types/api';
import { CRHistoryList } from './CRHistoryList';
import type { FilterConfig } from '@/components/shared/FilterBar';

interface Props {
  projectId: string;
}

const CATEGORY_OPTIONS = [
  { value: 'resource', label: 'Resource' },
  { value: 'external_cost', label: 'External Cost' },
  { value: 'scope', label: 'Scope' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: 'pending_cc_confirmation', label: 'Pending CC' },
  { value: 'pending_controller_approval', label: 'Pending Controller' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'sent_back_by_cc', label: 'Sent Back (CC)' },
  { value: 'sent_back_by_controller', label: 'Sent Back (Controller)' },
];

export function ChangeHistoryTab({ projectId }: Props) {
  const [items, setItems] = useState<CRHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({
    category: '',
    status: '',
  });

  useEffect(() => {
    setLoading(true);
    const params: { category?: string; status?: string } = {};
    if (filters.category) params.category = filters.category;
    if (filters.status) params.status = filters.status;

    workbenchApi
      .getChangeRequests(projectId, params)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [projectId, filters]);

  const filterConfigs: FilterConfig[] = [
    { key: 'category', label: 'Category', options: CATEGORY_OPTIONS },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS },
  ];

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filterConfigs}
        values={filters}
        onChange={(key, value) =>
          setFilters((prev) => ({ ...prev, [key]: value }))
        }
        onClear={() => setFilters({ category: '', status: '' })}
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <CRHistoryList items={items} projectId={projectId} />
      )}
    </div>
  );
}
