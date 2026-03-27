import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/formatters';
import type { CapacityRequestItem } from '@/types/api';
import { ArrowUp, ArrowDown, User } from 'lucide-react';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-muted text-muted-foreground',
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
        <h3 className="text-base font-semibold text-foreground">Request #{request.id}</h3>
        <div className="flex items-center gap-2">
          {direction && (
            <Badge className={isDecrease
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
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
          <span className="text-muted-foreground">Project: </span>
          {onProjectClick ? (
            <button
              type="button"
              onClick={onProjectClick}
              className="text-primary hover:underline"
            >
              {request.project_name}
            </button>
          ) : (
            <span className="text-foreground">{request.project_name}</span>
          )}
        </div>
        <div>
          <span className="text-muted-foreground">Type: </span>
          <span className="text-foreground">
            {isResource ? 'Resource Request' : 'External Cost'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">{isResource ? 'Role' : 'Cost Type'}: </span>
          <span className="text-foreground">{request.role_or_cost_type}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{isResource ? 'Hours/month' : 'Amount/month'}: </span>
          {isResource && direction ? (
            <span className="font-medium text-foreground">
              {originalHours != null && originalHours > 0 && (
                <span className="text-muted-foreground mr-1">{originalHours}h</span>
              )}
              <span className={isDecrease ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                {isDecrease ? '-' : '+'}{request.hours_or_amount}h
              </span>
              {newTotal != null && (
                <span className="text-foreground ml-1">
                  = {newTotal}h
                </span>
              )}
            </span>
          ) : (
            <span className="font-medium text-foreground">
              {isResource ? `${request.hours_or_amount}h` : formatCurrency(request.hours_or_amount)}
            </span>
          )}
        </div>
        <div>
          <span className="text-muted-foreground">Period: </span>
          <span className="text-foreground">
            {request.period_start} — {request.period_end}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Priority: </span>
          <Badge
            variant="outline"
            className={PRIORITY_COLORS[request.priority]}
          >
            {request.priority}
          </Badge>
        </div>
        {currentlyAllocated && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Currently allocated: </span>
            <span className="text-foreground inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {currentlyAllocated.name}
            </span>
          </div>
        )}
      </div>

      {request.explanation && (
        <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          <span className="text-xs font-medium text-muted-foreground">Response: </span>
          {request.explanation}
        </div>
      )}
    </div>
  );
}
