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
  Globe,
  Map,
  Coins,
  TableProperties,
  ShieldCheck,
  GitBranch,
  Workflow,
  Calendar,
  UserCog,
  KeyRound,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// Section 1 — Master Data
const MASTER_DATA_SECTIONS = [
  { key: 'cost_centers', label: 'Cost Centers', icon: Building2 },
  { key: 'competence_centers', label: 'Competence Centers', icon: Network },
  { key: 'lobs', label: 'Lines of Business', icon: Briefcase },
  { key: 'locations', label: 'Workforce Locations', icon: MapPin },
  { key: 'people', label: 'People', icon: Users },
  { key: 'charging_locations', label: 'Charging Locations', icon: Map },
  { key: 'legal_entities', label: 'Legal Entities', icon: Building2 },
  { key: 'regions', label: 'Regions', icon: Globe },
  { key: 'countries', label: 'Countries', icon: Globe },
  { key: 'user_measurement', label: 'User Measurement', icon: TableProperties },
] as const;

// Section 2 — Reference Catalogues
const REFERENCE_SECTIONS = [
  { key: 'role_types', label: 'Role Types', icon: UserCog },
  { key: 'external_cost_types', label: 'External Cost Types', icon: Coins },
  { key: 'project_dependencies', label: 'Project Dependencies', icon: GitBranch },
] as const;

// Section 3 — Planning & Ranking Configuration
const PLANNING_SECTIONS = [
  { key: 'parameters', label: 'Planning Parameters', icon: Settings },
] as const;

// Section 4 — Portfolio Hierarchy
const HIERARCHY_SECTIONS = [
  { key: 'portfolio_hierarchy', label: 'Portfolio Hierarchy', icon: Layers },
] as const;

// Section 5 — System
const SYSTEM_SECTIONS = [
  { key: 'users', label: 'Users', icon: Users },
  { key: 'role_permissions', label: 'Role Permissions', icon: KeyRound },
  { key: 'rate_tables', label: 'Rate Tables', icon: DollarSign },
  { key: 'workflow_templates', label: 'Workflow Templates', icon: Workflow },
  { key: 'scheduled_changes', label: 'Scheduled Changes', icon: Calendar },
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
            ? 'bg-primary/5 text-primary font-medium border-l-2 border-primary pl-2.5'
            : 'text-muted-foreground hover:bg-accent',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  const renderSection = (
    label: string,
    items: ReadonlyArray<{ key: string; label: string; icon: React.ElementType }>,
  ) => (
    <>
      <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 mt-2">
        {label}
      </p>
      {items.map(renderItem)}
    </>
  );

  return (
    <nav className="w-[240px] shrink-0 space-y-0.5 overflow-y-auto pr-1">
      {renderSection('1 · Master Data', MASTER_DATA_SECTIONS)}
      <Separator className="my-2" />
      {renderSection('2 · Reference Catalogues', REFERENCE_SECTIONS)}
      <Separator className="my-2" />
      {renderSection('3 · Planning & Ranking', PLANNING_SECTIONS)}
      <Separator className="my-2" />
      {renderSection('4 · Portfolio Hierarchy', HIERARCHY_SECTIONS)}
      <Separator className="my-2" />
      {renderSection('5 · System', SYSTEM_SECTIONS)}
    </nav>
  );
}

// Re-export the legacy item key list so consumers know what to expect
export const ADMIN_SECTION_KEYS: string[] = [
  ...MASTER_DATA_SECTIONS.map((s) => s.key),
  ...REFERENCE_SECTIONS.map((s) => s.key),
  ...PLANNING_SECTIONS.map((s) => s.key),
  ...HIERARCHY_SECTIONS.map((s) => s.key),
  ...SYSTEM_SECTIONS.map((s) => s.key),
];
