/**
 * EntitySelector — Admin module left-rail nav, refactored over the
 * shared LeftRailNav per `[E-07c]`. The five-section grouping is
 * preserved via LeftRailNav's `groups` prop; styling and active-state
 * treatment are delegated to the shared component.
 *
 * The flat key list is exported for callers that need to validate
 * deep-link parameters without instantiating the nav.
 */
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
  GitBranch,
  Workflow,
  Calendar,
  UserCog,
  KeyRound,
} from 'lucide-react';
import {
  LeftRailNav,
  type LeftRailNavGroup,
  type LeftRailNavItem,
} from '@/components/shared/LeftRailNav';

const MASTER_DATA_SECTIONS: LeftRailNavItem[] = [
  { id: 'cost_centers', label: 'Cost Centers', icon: Building2 },
  { id: 'competence_centers', label: 'Competence Centers', icon: Network },
  { id: 'lobs', label: 'Lines of Business', icon: Briefcase },
  { id: 'locations', label: 'Workforce Locations', icon: MapPin },
  { id: 'people', label: 'People', icon: Users },
  { id: 'charging_locations', label: 'Charging Locations', icon: Map },
  { id: 'legal_entities', label: 'Legal Entities', icon: Building2 },
  { id: 'regions', label: 'Regions', icon: Globe },
  { id: 'countries', label: 'Countries', icon: Globe },
  { id: 'user_measurement', label: 'User Measurement', icon: TableProperties },
];

const REFERENCE_SECTIONS: LeftRailNavItem[] = [
  { id: 'role_types', label: 'Role Types', icon: UserCog },
  { id: 'external_cost_types', label: 'External Cost Types', icon: Coins },
  { id: 'project_dependencies', label: 'Project Dependencies', icon: GitBranch },
];

const PLANNING_SECTIONS: LeftRailNavItem[] = [
  { id: 'parameters', label: 'Planning Parameters', icon: Settings },
];

const HIERARCHY_SECTIONS: LeftRailNavItem[] = [
  { id: 'portfolio_hierarchy', label: 'Portfolio Hierarchy', icon: Layers },
];

const SYSTEM_SECTIONS: LeftRailNavItem[] = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'role_permissions', label: 'Role Permissions', icon: KeyRound },
  { id: 'rate_tables', label: 'Rate Tables', icon: DollarSign },
  { id: 'workflow_templates', label: 'Workflow Templates', icon: Workflow },
  { id: 'scheduled_changes', label: 'Scheduled Changes', icon: Calendar },
  { id: 'audit_log', label: 'Audit Log', icon: FileText },
];

const ADMIN_GROUPS: LeftRailNavGroup[] = [
  { label: '1 · Master Data', items: MASTER_DATA_SECTIONS },
  { label: '2 · Reference Catalogues', items: REFERENCE_SECTIONS },
  { label: '3 · Planning & Ranking', items: PLANNING_SECTIONS },
  { label: '4 · Portfolio Hierarchy', items: HIERARCHY_SECTIONS },
  { label: '5 · System', items: SYSTEM_SECTIONS },
];

interface EntitySelectorProps {
  selected: string;
  onSelect: (key: string) => void;
}

export function EntitySelector({ selected, onSelect }: EntitySelectorProps) {
  return (
    <LeftRailNav
      ariaLabel="Administration sections"
      width={240}
      groups={ADMIN_GROUPS}
      activeId={selected}
      onSelect={onSelect}
    />
  );
}

export const ADMIN_SECTION_KEYS: string[] = [
  ...MASTER_DATA_SECTIONS,
  ...REFERENCE_SECTIONS,
  ...PLANNING_SECTIONS,
  ...HIERARCHY_SECTIONS,
  ...SYSTEM_SECTIONS,
].map((s) => s.id);
