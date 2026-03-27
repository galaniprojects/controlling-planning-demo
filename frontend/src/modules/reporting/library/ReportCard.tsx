import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface ReportCardProps {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  accent?: boolean;
}

export function ReportCard({ id, name, description, icon, accent }: ReportCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/reporting/${id}`)}
      className={`flex items-start gap-4 rounded-lg border p-5 text-left transition-all ${
        accent
          ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-900/20 hover:border-indigo-400 hover:shadow-sm'
          : 'border-border bg-card hover:border-primary/40 hover:shadow-sm'
      }`}
    >
      <div className={`mt-0.5 ${accent ? 'text-indigo-600 dark:text-indigo-400' : 'text-primary/80'}`}>{icon}</div>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{name}</h3>
          {accent && (
            <span className="inline-flex items-center rounded bg-indigo-100 dark:bg-indigo-900/30 px-1.5 py-0 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
              AI
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
