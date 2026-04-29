import { Network, Map as MapIcon, BarChart3, FileBarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ChargingSection = 'distribution' | 'btc' | 'rollup' | 'reports';

const SECTIONS: ReadonlyArray<{
  key: ChargingSection;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    key: 'distribution',
    label: 'Inter-service Distribution',
    description: 'Stage 1 cost-allocation edges across chargeable entities',
    icon: Network,
  },
  {
    key: 'btc',
    label: 'BTC Profiles',
    description: 'Stage 2 business-transfer charging by location',
    icon: BarChart3,
  },
  {
    key: 'rollup',
    label: 'Location Cost Rollup',
    description: 'Stage 1 + 2 effective costs by region, country, division',
    icon: MapIcon,
  },
  {
    key: 'reports',
    label: 'Reporting',
    description: 'Custom charging reports via the Report Builder',
    icon: FileBarChart2,
  },
];

interface Props {
  selected: ChargingSection;
  onSelect: (section: ChargingSection) => void;
}

export function ChargingSidebar({ selected, onSelect }: Props) {
  return (
    <nav
      aria-label="Charging & Allocations sections"
      className="w-[260px] shrink-0 space-y-0.5 overflow-y-auto pr-1"
    >
      <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 mt-2">
        Charging surfaces
      </p>
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = selected === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect(s.key)}
            className={cn(
              'flex flex-col items-start w-full px-3 py-2 text-sm rounded-md transition-colors text-left gap-0.5',
              isActive
                ? 'bg-primary/5 text-primary font-medium border-l-2 border-primary pl-2.5'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <span className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{s.label}</span>
            </span>
            <span
              className={cn(
                'text-[11px] leading-tight pl-[26px]',
                isActive ? 'text-primary/70' : 'text-muted-foreground/70',
              )}
            >
              {s.description}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
