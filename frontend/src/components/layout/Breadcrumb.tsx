import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTE_LABELS } from '@/lib/routes';

export function Breadcrumb() {
  const location = useLocation();
  const navigate = useNavigate();

  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return <span className="text-sm text-slate-500">Launchpad</span>;
  }

  return (
    <nav className="flex items-center gap-1.5">
      {segments.map((_, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/');
        const label = ROUTE_LABELS[path] || segments[i];
        const isLast = i === segments.length - 1;

        return (
          <span key={path} className="flex items-center gap-1.5">
            <span className="text-slate-300">/</span>
            {isLast ? (
              <span className="text-sm font-medium text-slate-700">{label}</span>
            ) : (
              <button
                onClick={() => navigate(path)}
                className="text-sm text-slate-500 hover:text-blue-800"
              >
                {label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
