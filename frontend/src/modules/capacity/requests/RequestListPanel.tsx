import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CapacityRequestItem } from '@/types/api';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-500',
};

const TYPE_LABELS: Record<string, string> = {
  resource: 'Resource',
  external_cost: 'External Cost',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatCycleLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  return `${MONTH_NAMES[monthIdx]} ${year} Cycle`;
}

function groupByCycle(requests: CapacityRequestItem[]): { cycle: string; items: CapacityRequestItem[] }[] {
  const map = new Map<string, CapacityRequestItem[]>();
  for (const req of requests) {
    const key = req.period_start.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(req);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ cycle: formatCycleLabel(key), items }));
}

interface RequestListPanelProps {
  requests: CapacityRequestItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function RequestListPanel({
  requests,
  selectedId,
  onSelect,
  collapsed,
  onToggleCollapse,
}: RequestListPanelProps) {
  if (collapsed) {
    return (
      <div className="flex h-full w-10 flex-col items-center border-r border-slate-200 bg-slate-50 pt-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="h-7 w-7 rounded border border-slate-200 bg-white text-xs text-slate-500 hover:bg-slate-100"
        >
          &rsaquo;
        </button>
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const other = requests.filter((r) => r.status !== 'pending');
  const pendingByCycle = groupByCycle(pending);
  const processedByCycle = groupByCycle(other);

  return (
    <div className="flex h-full w-[300px] flex-col border-r border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-sm font-medium text-slate-700">
          Requests ({requests.length})
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="h-7 w-7 rounded border border-slate-200 bg-white text-xs text-slate-500 hover:bg-slate-100"
        >
          &lsaquo;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {pendingByCycle.length > 0 && (
          <div>
            <div className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
              Pending ({pending.length})
            </div>
            {pendingByCycle.map((group) => (
              <div key={group.cycle}>
                <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400">
                  {group.cycle}
                </div>
                {group.items.map((req) => (
                  <RequestListItem
                    key={req.id}
                    request={req}
                    isSelected={req.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {processedByCycle.length > 0 && (
          <div>
            <div className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
              Processed ({other.length})
            </div>
            {processedByCycle.map((group) => (
              <div key={group.cycle}>
                <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400">
                  {group.cycle}
                </div>
                {group.items.map((req) => (
                  <RequestListItem
                    key={req.id}
                    request={req}
                    isSelected={req.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {requests.length === 0 && (
          <p className="px-3 py-6 text-sm text-slate-400 text-center">No requests.</p>
        )}
      </div>
    </div>
  );
}

function RequestListItem({
  request,
  isSelected,
  onSelect,
}: {
  request: CapacityRequestItem;
  isSelected: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(request.id)}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors',
        isSelected ? 'bg-blue-50' : 'hover:bg-white',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700 truncate">
          {request.project_name}
        </span>
        <Badge
          variant="outline"
          className={cn('shrink-0 text-[10px]', PRIORITY_COLORS[request.priority])}
        >
          {request.priority}
        </Badge>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        <Badge variant="outline" className="text-[10px]">
          {TYPE_LABELS[request.request_type] ?? request.request_type}
        </Badge>
        <span className="truncate">{request.role_or_cost_type}</span>
      </div>
      <div className="mt-1 text-xs text-slate-400">
        {request.period_start} — {request.period_end}
      </div>
    </button>
  );
}
