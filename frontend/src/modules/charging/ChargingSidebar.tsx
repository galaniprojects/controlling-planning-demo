/**
 * ChargingSidebar — thin wrapper over the shared LeftRailNav per `[E-07c]`.
 *
 * Section list and the `ChargingSection` type are kept here so existing
 * call sites continue to import from this module. Visual treatment is
 * delegated to `components/shared/LeftRailNav` so all left-rail navs in
 * the app render identically (Cluster D Admin pattern).
 */
import {
  BarChart3,
  FileBarChart2,
  Map as MapIcon,
  Network,
  TableProperties,
} from 'lucide-react';
import { LeftRailNav, type LeftRailNavItem } from '@/components/shared/LeftRailNav';

export type ChargingSection =
  | 'distribution'
  | 'btc'
  | 'user_measurement'
  | 'rollup'
  | 'reports';

const SECTIONS: LeftRailNavItem[] = [
  {
    id: 'distribution',
    label: 'Inter-service Distribution',
    description: 'Stage 1 cost-allocation edges across chargeable entities',
    icon: Network,
  },
  {
    id: 'btc',
    label: 'BTC Profiles',
    description: 'Stage 2 business-transfer charging by location',
    icon: BarChart3,
  },
  {
    id: 'user_measurement',
    label: 'User Measurement',
    description: 'Authored matrix driving internal-service Stage 2 + SAP export',
    icon: TableProperties,
  },
  {
    id: 'rollup',
    label: 'Location Cost Rollup',
    description: 'Stage 1 + 2 effective costs by region, country, division',
    icon: MapIcon,
  },
  {
    id: 'reports',
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
    <LeftRailNav
      ariaLabel="Charging & Allocations sections"
      width={260}
      items={SECTIONS}
      activeId={selected}
      onSelect={(id) => onSelect(id as ChargingSection)}
    />
  );
}
