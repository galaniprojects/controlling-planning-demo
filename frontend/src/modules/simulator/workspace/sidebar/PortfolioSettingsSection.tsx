/**
 * v5 B2 — PortfolioSettingsSection: shortcuts to portfolio-scoped surfaces.
 *
 * Routes to the surface keys handled by T1's SimulatorRouter.
 */
import { useNavigate, useParams } from 'react-router-dom';
import {
  PiggyBank,
  TrendingUp,
  ShieldCheck,
  Coins,
  Network,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const ENTRIES = [
  { key: 'budget-envelope', label: 'Budget envelope', Icon: PiggyBank },
  { key: 'rate-table', label: 'Rate tables', Icon: Coins },
  { key: 'escalation-factors', label: 'Escalation factors', Icon: TrendingUp },
  { key: 'cost-allocation', label: 'Cost allocation (Lever 12)', Icon: ShieldCheck },
  { key: 'hierarchy-reassign', label: 'Hierarchy reassign', Icon: Network },
];

export function PortfolioSettingsSection() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const navigateToSurface = (key: string) =>
    navigate(`/simulator/scenarios/${params.id}/surface/${key}`);

  return (
    <div className="space-y-1">
      {ENTRIES.map(({ key, label, Icon }) => (
        <Button
          key={key}
          variant="ghost"
          size="sm"
          className="w-full justify-start h-7 text-xs"
          onClick={() => navigateToSurface(key)}
        >
          <Icon className="h-3 w-3 mr-1.5 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </Button>
      ))}
    </div>
  );
}
