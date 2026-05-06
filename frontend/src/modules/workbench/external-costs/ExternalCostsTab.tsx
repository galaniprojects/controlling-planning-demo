/**
 * Workbench External Costs tab.
 *
 * v5.1 C-09 lead pre-work — orchestrator only. Owns shared filters
 * (category, role) and the role catalogue. Renders four section slots:
 *   1. KPI strip          → ExternalCostsKPIStrip
 *   2. Monthly grid (NEW) → ExternalCostsMonthlyGrid (Teammate B fills)
 *   3. Vendor table       → VendorBreakdownTable
 *   4. Category breakdown → CategoryBreakdownTable
 *
 * Data: vendor-summary + category-rollup fetched here; the monthly grid
 * owns its own fetch (see Teammate B file). Backend KPIs surface via the
 * `kpis` block on the vendor-summary response (lead pre-work zero-fills;
 * Teammate C wires the real values).
 */
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { Receipt } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { externalCostsApi, referenceApi } from '@/api/endpoints';
import type {
  ExternalCostsKpis,
  ProjectVendorSummaryRow,
  ProjectCategoryRollupRow,
  RefRole,
} from '@/types/api';
import { ExternalCostsKPIStrip } from './ExternalCostsKPIStrip';
import { VendorBreakdownTable } from './VendorBreakdownTable';
import { CategoryBreakdownTable } from './CategoryBreakdownTable';
import { ExternalCostsMonthlyGrid } from './ExternalCostsMonthlyGrid';

interface Props {
  projectId: string;
}

export function ExternalCostsTab({ projectId }: Props) {
  const [vendors, setVendors] = useState<ProjectVendorSummaryRow[]>([]);
  const [categories, setCategories] = useState<ProjectCategoryRollupRow[]>([]);
  const [kpis, setKpis] = useState<ExternalCostsKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lifted shared state — both the vendor table and the new monthly grid
  // react to the same role filter so the tab stays visually coherent.
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [roles, setRoles] = useState<RefRole[]>([]);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      externalCostsApi.getProjectVendorSummary(projectId),
      externalCostsApi.getProjectCategoryRollup(projectId),
    ])
      .then(([vRes, cRes]) => {
        if (cancelled) return;
        setVendors(vRes.items);
        setCategories(cRes.items);
        setKpis(vRes.kpis ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Could not load external costs',
        );
        setVendors([]);
        setCategories([]);
        setKpis(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // v5.1 C-07: load role catalogue once for the Role filter dropdown.
  useEffect(() => {
    let cancelled = false;
    referenceApi
      .getRoles()
      .then((res) => {
        if (cancelled) return;
        setRoles(res.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </Card>
    );
  }

  if (vendors.length === 0 && categories.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Receipt}
          title="No external cost data"
          description="No external cost data recorded for this project yet."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ExternalCostsKPIStrip vendors={vendors} kpis={kpis} />
      <ExternalCostsMonthlyGrid
        projectId={projectId}
        roleFilter={roleFilter}
      />
      <VendorBreakdownTable
        vendors={vendors}
        categoryFilter={categoryFilter}
        roleFilter={roleFilter}
        roles={roles}
        onRoleFilterChange={setRoleFilter}
      />
      <CategoryBreakdownTable
        categories={categories}
        categoryFilter={categoryFilter}
        onSetCategoryFilter={setCategoryFilter}
      />
    </div>
  );
}
