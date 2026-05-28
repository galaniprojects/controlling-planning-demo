import { Link, useLocation } from 'react-router-dom';
import { ROUTE_LABELS } from '@/lib/routes';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface Props {
  /**
   * Optional explicit breadcrumb chain. When provided the component renders
   * exactly these items (last item plain, earlier items as `<Link>`). When
   * omitted the component falls back to the path-based logic via
   * `ROUTE_LABELS` so existing call sites keep working unchanged.
   *
   * Service Workbench Wave C uses the explicit form to surface
   * "Workbench › <Entity> › Allocation Flow" on the cascade DAG view per
   * the Wave C plan §"Track B — AllocationFlowView surgery".
   */
  items?: BreadcrumbItem[];
}

export function Breadcrumb({ items }: Props = {}) {
  const location = useLocation();

  if (items && items.length > 0) {
    return (
      <nav className="flex items-center gap-1.5" aria-label="Breadcrumb">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <span className="text-muted-foreground/40">/</span>
              )}
              {isLast || !item.to ? (
                <span className="text-sm font-medium text-foreground">
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  {item.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
    );
  }

  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return <span className="text-sm text-muted-foreground">Launchpad</span>;
  }

  return (
    <nav className="flex items-center gap-1.5" aria-label="Breadcrumb">
      {segments.map((_, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/');
        const label = ROUTE_LABELS[path] || segments[i];
        const isLast = i === segments.length - 1;

        return (
          <span key={path} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-muted-foreground/40">/</span>
            )}
            {isLast ? (
              <span className="text-sm font-medium text-foreground">{label}</span>
            ) : (
              <Link
                to={path}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
