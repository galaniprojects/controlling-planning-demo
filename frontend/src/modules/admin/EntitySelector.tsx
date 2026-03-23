import {
  Building2,
  Network,
  Briefcase,
  MapPin,
  Users,
  DollarSign,
  Settings,
  FileText,
  Layers,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const ENTITY_SECTIONS = [
  { key: 'cost_centers', label: 'Cost Centers', icon: Building2 },
  { key: 'competence_centers', label: 'Competence Centers', icon: Network },
  { key: 'lobs', label: 'Lines of Business', icon: Briefcase },
  { key: 'locations', label: 'Locations', icon: MapPin },
  { key: 'people', label: 'People', icon: Users },
  { key: 'rate_tables', label: 'Rate Tables', icon: DollarSign },
] as const;

const PORTFOLIO_SECTIONS = [
  { key: 'portfolio_hierarchy', label: 'Portfolio Hierarchy', icon: Layers },
] as const;

const SYSTEM_SECTIONS = [
  { key: 'parameters', label: 'Planning Parameters', icon: Settings },
  { key: 'audit_log', label: 'Audit Log', icon: FileText },
] as const;

interface EntitySelectorProps {
  selected: string;
  onSelect: (key: string) => void;
}

export function EntitySelector({ selected, onSelect }: EntitySelectorProps) {
  const renderItem = (item: { key: string; label: string; icon: React.ElementType }) => {
    const Icon = item.icon;
    const isActive = selected === item.key;
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => onSelect(item.key)}
        className={cn(
          'flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-md transition-colors text-left',
          isActive
            ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600 pl-2.5'
            : 'text-slate-600 hover:bg-slate-100',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {item.label}
      </button>
    );
  };

  return (
    <nav className="w-[220px] shrink-0 space-y-1">
      <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
        Entities
      </p>
      {ENTITY_SECTIONS.map(renderItem)}
      <Separator className="my-2" />
      <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
        Portfolio Structure
      </p>
      {PORTFOLIO_SECTIONS.map(renderItem)}
      <Separator className="my-2" />
      <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
        System
      </p>
      {SYSTEM_SECTIONS.map(renderItem)}
    </nav>
  );
}
