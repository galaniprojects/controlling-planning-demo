/**
 * RunPortfolioTab — entity list for the Run Portfolio sub-module per [E-11].
 *
 * Consumes the F2 chargeable-entities data layer
 * (``GET /api/admin/chargeable-entities``) and renders a unified entity list
 * with a type filter (Project / Offering / InternalService) and type-aware
 * columns:
 *
 * - identifier (PPM / S-code / ITF prefix)
 * - name + description
 * - To-Business %
 * - Annual cost (where present)
 * - Termination month (where set)
 *
 * Wave 5 F7 (rest) wiring per [E-11] / [A-PL-07]:
 *
 *   1. The 4 KPI cards now surface the spec-aligned figures: total annual
 *      cost, To-Business vs internal split, count by entity type, and
 *      outsourcing ratio across the active Run-portfolio set.
 *   2. Three compact rollup panels embedded under the KPI strip aggregate
 *      effective cost by region / division / country (reuses the F5
 *      `chargingApi.getRollup` endpoint, scoped to Run-portfolio entities).
 *   3. Offering and InternalService rows are now clickable; navigation
 *      lands on the Workbench BTC tab via
 *      ``/workbench?entity={id}&type={offering|internal_service}``.
 *      ProjectWorkspace / ProjectWorkbench accept the new ``entity`` query
 *      param alongside ``project`` (additive change — F6's BTC tab is
 *      already conditional on entity presence).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/shared/Skeleton';
import { chargeableEntitiesApi } from '@/api/endpoints';
import type {
  ChargeableEntityItem,
  ChargeableEntityType,
} from '@/types/runPortfolio';
import { useRole } from '@/contexts/RoleContext';
import { RunDimensionRollupPanel } from './RunDimensionRollupPanel';

const TYPE_FILTERS: { value: '' | ChargeableEntityType; label: string }[] = [
  { value: '', label: 'All entity types' },
  { value: 'Project', label: 'Projects (DoI 5)' },
  { value: 'Offering', label: 'Offerings' },
  { value: 'InternalService', label: 'Internal services' },
];

// Demo year for the embedded rollup panels — matches the v5 demo date
// (April 2026) and the Charging module's default year.
const ROLLUP_YEAR = 2026;

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(1).replace('.', ',') + '%';
}

function fmtEur(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '€0';
  if (n >= 1_000_000) {
    return '€' + (n / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  }
  if (n >= 1_000) {
    return '€' + (n / 1_000).toFixed(0) + 'K';
  }
  return '€' + Math.round(n).toString();
}

function entityTypePill(type: ChargeableEntityType): string {
  switch (type) {
    case 'Project':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'Offering':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400';
    case 'InternalService':
      return 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function entityTypeShort(type: ChargeableEntityType): string {
  switch (type) {
    case 'Project':
      return 'Project';
    case 'Offering':
      return 'Offering';
    case 'InternalService':
      return 'Internal Svc';
    default:
      return type;
  }
}

/**
 * Build the drill-down URL for an entity row. Projects route to the
 * existing Workbench project view; Offerings + InternalServices use the new
 * `entity` query param so the Workbench can render an entity-only view
 * (see ProjectWorkbench.tsx + ProjectWorkspace.tsx for the consumer side).
 */
function entityDrillDownPath(entity: ChargeableEntityItem): string | null {
  if (entity.entity_type === 'Project' && entity.project_id) {
    return `/workbench?project=${encodeURIComponent(entity.project_id)}`;
  }
  if (entity.entity_type === 'Offering') {
    return `/workbench?entity=${encodeURIComponent(entity.id)}&type=offering`;
  }
  if (entity.entity_type === 'InternalService') {
    return `/workbench?entity=${encodeURIComponent(entity.id)}&type=internal_service`;
  }
  return null;
}

export function RunPortfolioTab() {
  const navigate = useNavigate();
  const { context } = useRole();
  const role = context?.role;
  const [items, setItems] = useState<ChargeableEntityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'' | ChargeableEntityType>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    chargeableEntitiesApi
      .list({ entity_type: typeFilter || undefined, is_active: true })
      .then((res) => {
        if (cancelled) return;
        // Run Portfolio = entities classified Run by the backend
        // (Project @ DoI 5 / all Offerings / all InternalServices) per [E-11].
        const runOnly = res.items.filter(
          (e) =>
            e.is_change_or_run === 'Run' ||
            e.is_change_or_run === 'run',
        );
        setItems(runOnly);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : 'Could not load Run Portfolio entities',
          );
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typeFilter]);

  // Spec KPIs per F7 / [E-11] / [A-PL-07]:
  //   - Total annual cost = Σ annual_cost across active Run entities
  //   - To-Business share = Σ(annual_cost · to_business_pct) / total
  //     Internal share is the residual; self-retained sits inside the
  //     internal split until the F5 distribution rollup attributes it.
  //   - Mix = count by entity_type (Projects / Offerings / Internal Svc)
  //   - Outsourcing ratio = % of entities assigned to an external vendor.
  //     Vendor data is not on ChargeableEntity in the demo seed; we
  //     surrogate this with the share of Offerings (typically vendor-
  //     supplied service catalogue items in the run portfolio) per the
  //     spec's "outsourcing ratio for the Run Portfolio" intent.
  const kpis = useMemo(() => {
    const total = items.length;
    const totalAnnual = items.reduce(
      (s, e) => s + (e.annual_cost ?? 0),
      0,
    );
    const projectCount = items.filter((e) => e.entity_type === 'Project').length;
    const offeringCount = items.filter((e) => e.entity_type === 'Offering').length;
    const internalCount = items.filter(
      (e) => e.entity_type === 'InternalService',
    ).length;
    const totalToBusinessAmount = items.reduce(
      (s, e) => s + ((e.annual_cost ?? 0) * (e.to_business_pct ?? 0)) / 100,
      0,
    );
    const toBusinessPct =
      totalAnnual > 0 ? (totalToBusinessAmount / totalAnnual) * 100 : 0;
    const internalPct = Math.max(0, 100 - toBusinessPct);
    const outsourcingPct =
      total > 0 ? (offeringCount / total) * 100 : 0;
    return {
      total,
      projectCount,
      offeringCount,
      internalCount,
      totalAnnual,
      toBusinessPct,
      internalPct,
      outsourcingPct,
    };
  }, [items]);

  const entityIds = useMemo(() => items.map((e) => e.id), [items]);

  return (
    <div className="space-y-4">
      {/* Spec-aligned KPI strip (F7 / [E-11]) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Total annual cost"
          value={fmtEur(kpis.totalAnnual)}
          hint={`${kpis.total} active run-stage entities`}
        />
        <KPICard
          label="To-Business / internal"
          value={`${fmtPct(kpis.toBusinessPct)} · ${fmtPct(kpis.internalPct)}`}
          hint="Weighted by annual cost"
        />
        <KPICard
          label="Mix by entity type"
          value={`${kpis.projectCount} P · ${kpis.offeringCount} O · ${kpis.internalCount} S`}
          hint="Projects · Offerings · Internal services"
        />
        <KPICard
          label="Outsourcing ratio"
          value={fmtPct(kpis.outsourcingPct)}
          hint="Share served by external offerings"
        />
      </div>

      {/* Embedded rollup panels — by region / division / country */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <RunDimensionRollupPanel
          title="By region"
          groupBy="region"
          year={ROLLUP_YEAR}
          entityIds={entityIds}
        />
        <RunDimensionRollupPanel
          title="By division"
          groupBy="division"
          year={ROLLUP_YEAR}
          entityIds={entityIds}
        />
        <RunDimensionRollupPanel
          title="By country"
          groupBy="country"
          year={ROLLUP_YEAR}
          entityIds={entityIds}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Entity type
          </span>
          <Select
            value={typeFilter || 'all'}
            onValueChange={(v) =>
              setTypeFilter(v === 'all' ? '' : (v as ChargeableEntityType))
            }
          >
            <SelectTrigger className="h-9 min-w-[200px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTERS.map((f) => (
                <SelectItem key={f.value || 'all'} value={f.value || 'all'}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Entity list */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Type</TableHead>
              <TableHead className="w-32">Identifier</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right w-32">Annual cost</TableHead>
              <TableHead className="text-right w-32">To-Business</TableHead>
              <TableHead className="w-32">Termination</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  <div className="space-y-1">
                    <div>Run Portfolio data is unavailable.</div>
                    <div className="text-xs opacity-70">
                      {role !== 'controller'
                        ? 'Run Portfolio is currently restricted to controllers; access opens to other roles in a follow-on session.'
                        : error}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No entities found in this filter.
                </TableCell>
              </TableRow>
            ) : (
              items.map((entity) => {
                const drillTo = entityDrillDownPath(entity);
                return (
                  <TableRow
                    key={entity.id}
                    className={
                      drillTo
                        ? 'cursor-pointer hover:bg-accent'
                        : 'opacity-90'
                    }
                    onClick={() => {
                      if (drillTo) navigate(drillTo);
                    }}
                  >
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${entityTypePill(entity.entity_type)}`}
                      >
                        {entityTypeShort(entity.entity_type)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {entity.identifier}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-foreground">
                          {entity.name}
                        </div>
                        {entity.description ? (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {entity.description}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEur(entity.annual_cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtPct(entity.to_business_pct)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entity.termination_month ?? '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground">
        Click any row to open the Workbench BTC tab for that entity. Project
        rows route via project id; Offerings + Internal Services route via
        the entity id (Workbench accepts both).
      </p>
    </div>
  );
}

function KPICard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="px-4 py-3 space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-xl font-semibold text-foreground tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      ) : null}
    </Card>
  );
}
