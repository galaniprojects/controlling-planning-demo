/**
 * ModuleHeader — shared module-level page header per `[E-07a]`.
 *
 * Replaces the four divergent header patterns audited in v5 Session E8:
 * `text-2xl` (Portfolio/Workbench/Capacity/Backlog), `text-xl`
 * (Charging/Admin/Docs/Simulator), and the conditional-hide pattern
 * (Reporting). Two sanctioned exceptions remain: the centred
 * `LaunchpadHeader` (E7 home redesign) and Reporting's nested
 * builder/ai-builder routes (each renders its own header).
 *
 * Usage:
 *   <ModuleHeader
 *     title="Portfolio"
 *     subtitle="Tracking the change and run portfolios"
 *     actions={<ModuleGuideButton moduleId="portfolio" />}
 *   />
 *
 *   <ModuleHeader
 *     title="Workbench"
 *     actions={<><Button>New project</Button><ModuleGuideButton .../></>}
 *     tabs={<Tabs ...>...</Tabs>}
 *   />
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ModuleHeaderProps {
  /** Module/view title (renders as h1). */
  title: ReactNode;
  /** Optional one-line subtitle below the title. */
  subtitle?: ReactNode;
  /**
   * Right-aligned action area. Typically holds module-level buttons
   * + the ModuleGuideButton.
   */
  actions?: ReactNode;
  /**
   * Optional breadcrumb rendered above the title (e.g. on full-page
   * detail views).
   */
  breadcrumb?: ReactNode;
  /**
   * Optional tab strip rendered below the title row. Pass a `<Tabs>`
   * element or a custom switcher (e.g. Portfolio's Change/Run pill).
   */
  tabs?: ReactNode;
  /** Extra className passed to the outer wrapper. */
  className?: string;
}

export function ModuleHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  tabs,
  className,
}: ModuleHeaderProps) {
  return (
    <header className={cn('space-y-3', className)}>
      {breadcrumb && <div>{breadcrumb}</div>}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
      {tabs && <div>{tabs}</div>}
    </header>
  );
}
