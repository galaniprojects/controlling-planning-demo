import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface ReportCardProps {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
}

export function ReportCard({ id, name, description, icon }: ReportCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/reporting/${id}`)}
      className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="mt-0.5 text-blue-600">{icon}</div>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{name}</h3>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
