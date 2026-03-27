import { useState, useEffect } from 'react';
import { capacityApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { cn } from '@/lib/utils';
import type { CapacityRequestItem, RoleHeatmapRow, AssignmentPreview } from '@/types/api';
import { AssignmentPreviewView } from './AssignmentPreview';

interface AvailabilityContextProps {
  ccId: string;
  request: CapacityRequestItem;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string | null) => void;
}

export function AvailabilityContext({
  ccId,
  request,
  selectedPersonId,
  onSelectPerson,
}: AvailabilityContextProps) {
  const isResource = request.request_type === 'resource';

  if (!isResource) {
    return (
      <div className="rounded-md border border-border bg-card p-4">
        <h4 className="text-sm font-medium text-foreground mb-2">External Cost Request</h4>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            <span className="text-muted-foreground">Cost Type: </span>
            {request.role_or_cost_type}
          </p>
          <p>
            <span className="text-muted-foreground">Amount: </span>
            €{request.hours_or_amount.toLocaleString()}/month
          </p>
          <p>
            <span className="text-muted-foreground">Period: </span>
            {request.period_start} — {request.period_end}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ResourceAvailability
      ccId={ccId}
      request={request}
      selectedPersonId={selectedPersonId}
      onSelectPerson={onSelectPerson}
    />
  );
}

function ResourceAvailability({
  ccId,
  request,
  selectedPersonId,
  onSelectPerson,
}: {
  ccId: string;
  request: CapacityRequestItem;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string | null) => void;
}) {
  const [heatmapData, setHeatmapData] = useState<RoleHeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<AssignmentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch team heatmap to show matching-role people
  useEffect(() => {
    setLoading(true);
    capacityApi
      .getTeamHeatmap(ccId, request.period_start, request.period_end)
      .then((res) => setHeatmapData(res.items))
      .catch(() => setHeatmapData([]))
      .finally(() => setLoading(false));
  }, [ccId, request.period_start, request.period_end]);

  // Fetch assignment preview when person selected
  useEffect(() => {
    if (!selectedPersonId) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    capacityApi
      .getAssignmentPreview(ccId, request.id, selectedPersonId)
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [ccId, request.id, selectedPersonId]);

  if (loading) {
    return <Skeleton className="h-40 w-full" />;
  }

  // Find all people (flatten across all roles)
  const allPeople = heatmapData.flatMap((role) =>
    role.people.map((p) => ({
      ...p,
      roleName: role.role_name,
    })),
  );

  if (allPeople.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No team members available for assignment.</p>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-foreground">
        Available Team Members
      </h4>

      <div className="rounded-md border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Person</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Role</th>
              {allPeople[0]?.utilization.map((c) => (
                <th key={c.month} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                  {c.month.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allPeople.map((person) => {
              const isSelected = person.person_id === selectedPersonId;
              return (
                <tr
                  key={person.person_id}
                  className={cn(
                    'border-b border-border/50 cursor-pointer transition-colors',
                    isSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                  )}
                  onClick={() =>
                    onSelectPerson(isSelected ? null : person.person_id)
                  }
                >
                  <td className="px-3 py-2 font-medium text-foreground">{person.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{person.roleName}</td>
                  {person.utilization.map((cell) => {
                    const bgMap: Record<string, string> = {
                      blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                      green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                      amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                      red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    };
                    return (
                      <td key={cell.month} className="px-2 py-2 text-center">
                        <span className={cn('rounded px-1.5 py-0.5 text-xs', bgMap[cell.color])}>
                          {cell.value.toFixed(0)}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedPersonId && previewLoading && <Skeleton className="h-32 w-full" />}
      {preview && <AssignmentPreviewView data={preview} />}
    </div>
  );
}
