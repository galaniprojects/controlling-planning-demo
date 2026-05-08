/**
 * DashboardToggle — v5.2 W4 Track B (§11.1).
 *
 * Compact chevron + label bar for collapsing/expanding the DashboardLayer.
 * Collapse state is persisted by the parent (DashboardLayer) via localStorage.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §11.1
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}

export function DashboardToggle({ collapsed, onToggle, className }: DashboardToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-medium',
        'text-muted-foreground hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        'transition-colors',
        className,
      )}
      aria-expanded={!collapsed}
    >
      {collapsed ? (
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>Capacity Dashboard</span>
    </button>
  );
}

export default DashboardToggle;
