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
          ? 'border-indigo-200 bg-indigo-50/40 hover:border-indigo-400 hover:shadow-sm'
          : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
      }`}
    >
      <div className={`mt-0.5 ${accent ? 'text-indigo-600' : 'text-blue-600'}`}>{icon}</div>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{name}</h3>
          {accent && (
            <span className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0 text-[10px] font-medium text-indigo-600">
              AI
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
