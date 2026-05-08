/**
 * AvailabilityKPIs — v5.2 W4 Track C (spec §13.4)
 *
 * Three compact KPI cards for the PL availability view:
 *   1. Roles shown — count of distinct role types visible
 *   2. Total headcount — sum of distinct active people across visible roles
 *   3. Avg availability — mean of per-role availability percentages
 *
 * Uses the shared SummaryCard component.
 * Data privacy: these are aggregate signals only — no person-level data.
 */
import { Layers, Users, TrendingUp } from 'lucide-react';
import { SummaryCard } from '@/components/shared/SummaryCard';
import type { RoleData } from './types';

interface AvailabilityKPIsProps {
  roles: RoleData[];
}

export function AvailabilityKPIs({ roles }: AvailabilityKPIsProps) {
  // Roles shown: count of distinct role types
  const rolesShown = roles.length;

  // Total headcount: sum of headcount across visible roles.
  // Each role's headcount is already scoped to the selected location.
  const totalHeadcount = roles.reduce((sum, r) => sum + r.headcount, 0);

  // Avg availability: mean of per-role availability percentages across all months.
  // Availability pct per role-month = available_hours / standard_hours.
  let availPctSum = 0;
  let availPctCount = 0;
  for (const role of roles) {
    for (const row of Object.values(role.monthData)) {
      if (row.standard_hours > 0) {
        availPctSum += (row.available_hours / row.standard_hours) * 100;
        availPctCount += 1;
      }
    }
  }
  const avgAvailability =
    availPctCount > 0 ? Math.round(availPctSum / availPctCount) : 0;

  return (
    <div className="grid grid-cols-3 gap-3">
      <SummaryCard
        label="Roles shown"
        value={rolesShown}
        icon={<Layers className="h-4 w-4" />}
      />
      <SummaryCard
        label="Total headcount"
        value={totalHeadcount}
        icon={<Users className="h-4 w-4" />}
      />
      <SummaryCard
        label="Avg availability"
        value={`${avgAvailability}%`}
        icon={<TrendingUp className="h-4 w-4" />}
      />
    </div>
  );
}
