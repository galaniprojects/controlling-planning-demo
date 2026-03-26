import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/formatters';
import type { CapacityRequestItem } from '@/types/api';
import { ArrowUp, ArrowDown, User } from 'lucide-react';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-500',
};

interface RequestDetailProps {
  request: CapacityRequestItem;
  onProjectClick?: () => void;
}

export function RequestDetail({ request, onProjectClick }: RequestDetailProps) {
  const isResource = request.request_type === 'resource';
  const direction = (request as any).change_direction as string | null;
  const originalHours = (request as any).original_hours as number | null;
  const currentlyAllocated = (request as any).currently_allocated as { id: string; name: string } | null;
  const isDecrease = direction === 'decrease';
  const newTotal = direction && originalHours != null
    ? (isDecrease ? originalHours - request.hours_or_amount : originalHours + request.hours_or_amount)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">Request #{request.id}</h3>
        <div className="flex items-center gap-2">
          {direction && (
            <Badge className={isDecrease
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700'
            }>
              {isDecrease
                ? <><ArrowDown className="h-3 w-3 mr-0.5" />Decrease</>
                : <><ArrowUp className="h-3 w-3 mr-0.5" />Increase</>
              }
            </Badge>
          )}
          <StatusBadge status={request.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-slate-500">Project: </span>
          {onProjectClick ? (
            <button
              type="button"
              onClick={onProjectClick}
              className="text-blue-700 hover:underline"
            >
              {request.project_name}
            </button>
          ) : (
            <span className="text-slate-700">{request.project_name}</span>
          )}
        </div>
        <div>
          <span className="text-slate-500">Type: </span>
          <span className="text-slate-700">
            {isResource ? 'Resource Request' : 'External Cost'}
          </span>
        </div>
        <div>
          <span className="text-slate-500">{isResource ? 'Role' : 'Cost Type'}: </span>
          <span className="text-slate-700">{request.role_or_cost_type}</span>
        </div>
        <div>
          <span className="text-slate-500">{isResource ? 'Hours/month' : 'Amount/month'}: </span>
          {isResource && direction ? (
            <span className="font-medium text-slate-700">
              {originalHours != null && originalHours > 0 && (
                <span className="text-slate-400 mr-1">{originalHours}h</span>
              )}
              <span className={isDecrease ? 'text-red-600' : 'text-green-600'}>
                {isDecrease ? '-' : '+'}{request.hours_or_amount}h
              </span>
              {newTotal != null && (
                <span className="text-slate-700 ml-1">
                  = {newTotal}h
                </span>
              )}
            </span>
          ) : (
            <span className="font-medium text-slate-700">
              {isResource ? `${request.hours_or_amount}h` : formatCurrency(request.hours_or_amount)}
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-500">Period: </span>
          <span className="text-slate-700">
            {request.period_start} — {request.period_end}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Priority: </span>
          <Badge
            variant="outline"
            className={PRIORITY_COLORS[request.priority]}
          >
            {request.priority}
          </Badge>
        </div>
        {currentlyAllocated && (
          <div className="col-span-2">
            <span className="text-slate-500">Currently allocated: </span>
            <span className="text-slate-700 inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {currentlyAllocated.name}
            </span>
          </div>
        )}
      </div>

      {request.explanation && (
        <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          <span className="text-xs font-medium text-slate-500">Response: </span>
          {request.explanation}
        </div>
      )}
    </div>
  );
}
