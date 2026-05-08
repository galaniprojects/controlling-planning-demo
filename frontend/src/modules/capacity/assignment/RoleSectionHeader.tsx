/**
 * RoleSectionHeader — v5.2 W4 Track A (Session 6a).
 *
 * Header for each collapsible RoleSection:
 *   - Role name (weight 500)
 *   - Request meta: "80h/mo | high priority | Jun–Dec 2026"
 *   - Completion badge: "7/7" green or "3/7" amber
 *   - Expand/collapse chevron
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2 "Role section header"
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Month label helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

function fmtMonthShort(iso: string): string {
  const [year, mon] = iso.split('-');
  const idx = parseInt(mon, 10) - 1;
  return `${MONTH_NAMES[idx] ?? mon} ${year}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RoleSectionHeaderProps {
  roleName: string;
  hoursPerMonth: number;
  priority: string;
  periodStart: string;
  periodEnd: string;
  assignedCount: number;
  totalMonths: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export function RoleSectionHeader({
  roleName,
  hoursPerMonth,
  priority,
  periodStart,
  periodEnd,
  assignedCount,
  totalMonths,
  isExpanded,
  onToggle,
}: RoleSectionHeaderProps) {
  const complete = assignedCount >= totalMonths && totalMonths > 0;
  const completeBadge = `${assignedCount}/${totalMonths}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-1 py-2 hover:bg-accent/50 rounded-sm text-left"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-foreground">{roleName}</span>
        <span className="text-[11px] text-muted-foreground">
          {hoursPerMonth}h/mo{priority ? ` | ${priority} priority` : ''} |{' '}
          {fmtMonthShort(periodStart)} – {fmtMonthShort(periodEnd)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        <Badge
          variant="outline"
          className={`rounded-full px-1.5 text-[10px] font-medium ${
            complete
              ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
          }`}
        >
          {completeBadge}
        </Badge>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </button>
  );
}
