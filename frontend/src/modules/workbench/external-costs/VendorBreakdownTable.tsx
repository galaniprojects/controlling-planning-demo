/**
 * Vendor breakdown table for the Workbench External Costs tab.
 *
 * v5.1 C-09 lead pre-work — extracted from `ExternalCostsTab.tsx` so
 * Teammate A can add the four new columns (Contract reference, Contract
 * end date, Open PO, Remaining not invoiced) and extend the SortKey
 * union without touching the tab orchestrator.
 *
 * Owns: sort state, expand state, role filter `<Select>` chrome (the
 * canonical role-filter UI per the Wave 4 C-07 layout). The role value
 * itself lives on the Tab (lifted state) so the new monthly grid in the
 * same Tab can react to the same filter.
 */
import { Fragment, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ProjectVendorSummaryRow, RefRole } from '@/types/api';

type SortKey = 'vendor' | 'role' | 'forecast' | 'actuals' | 'remaining' | 'variance';

const ROLE_ALL = '__all__'; // sentinel for the "All roles" Select option

interface Props {
  vendors: ProjectVendorSummaryRow[];
  categoryFilter: string | null;
  roleFilter: string | null;
  roles: RefRole[];
  onRoleFilterChange: (roleId: string | null) => void;
}

export function VendorBreakdownTable({
  vendors,
  categoryFilter,
  roleFilter,
  roles,
  onRoleFilterChange,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('forecast');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sortedVendors = useMemo(() => {
    let arr = categoryFilter
      ? vendors.filter((v) => v.expense_cost_type === categoryFilter)
      : vendors.slice();
    if (roleFilter) {
      arr = arr.filter((v) => v.role_type_id === roleFilter);
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'vendor':
          return a.vendor_name.localeCompare(b.vendor_name) * dir;
        case 'role':
          return (
            (a.role_name ?? '').localeCompare(b.role_name ?? '') * dir
          );
        case 'forecast':
          return (a.forecast_total - b.forecast_total) * dir;
        case 'actuals':
          return (a.actuals_total - b.actuals_total) * dir;
        case 'remaining':
          return (a.remaining - b.remaining) * dir;
        case 'variance':
          return (a.variance - b.variance) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [vendors, sortKey, sortDir, categoryFilter, roleFilter]);

  const activeRoleName = useMemo(() => {
    if (!roleFilter) return null;
    return roles.find((r) => r.id === roleFilter)?.name ?? null;
  }, [roleFilter, roles]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'vendor' ? 'asc' : 'desc');
    }
  }

  function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          By vendor
          {categoryFilter && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              filtered: {categoryFilter}
            </Badge>
          )}
          {activeRoleName && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              role: {activeRoleName}
            </Badge>
          )}
        </h3>
        {/* v5.1 C-07: Role filter — visible to all four personas */}
        <div className="flex items-center gap-2">
          <Select
            value={roleFilter ?? ROLE_ALL}
            onValueChange={(v) =>
              onRoleFilterChange(v === ROLE_ALL ? null : v)
            }
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROLE_ALL}>All roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {roleFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => onRoleFilterChange(null)}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <SortHead
                current={sortKey}
                dir={sortDir}
                k="vendor"
                toggle={toggleSort}
                label="Vendor"
              />
              <TableHead>Cost type</TableHead>
              <SortHead
                current={sortKey}
                dir={sortDir}
                k="role"
                toggle={toggleSort}
                label="Role"
              />
              <SortHead
                current={sortKey}
                dir={sortDir}
                k="forecast"
                toggle={toggleSort}
                label="Forecast"
                align="right"
              />
              <SortHead
                current={sortKey}
                dir={sortDir}
                k="actuals"
                toggle={toggleSort}
                label="Actuals"
                align="right"
              />
              <SortHead
                current={sortKey}
                dir={sortDir}
                k="remaining"
                toggle={toggleSort}
                label="Remaining"
                align="right"
              />
              <SortHead
                current={sortKey}
                dir={sortDir}
                k="variance"
                toggle={toggleSort}
                label="Variance"
                align="right"
              />
              <TableHead className="text-right w-20">POs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedVendors.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-xs text-muted-foreground py-8"
                >
                  No vendors match the current filter.
                </TableCell>
              </TableRow>
            ) : (
              sortedVendors.map((v) => {
                const isOpen = expanded.has(v.vendor_name);
                return (
                  <Fragment key={v.vendor_name}>
                    <TableRow
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => toggleExpand(v.vendor_name)}
                    >
                      <TableCell className="text-muted-foreground">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {v.vendor_name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {v.expense_cost_type}
                      </TableCell>
                      <TableCell className="text-xs">
                        {v.role_name ? (
                          <span className="text-foreground">
                            {v.role_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(v.forecast_total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatCurrency(v.actuals_total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(v.remaining)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          v.variance > 0
                            ? 'text-amber-700 dark:text-amber-400'
                            : v.variance < 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-muted-foreground',
                        )}
                      >
                        {formatCurrency(v.variance)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.po_count}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={8} className="py-3">
                          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                            <div>
                              <dt className="text-muted-foreground">
                                Baseline
                              </dt>
                              <dd className="tabular-nums text-foreground">
                                {formatCurrency(v.baseline_total)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Lines
                              </dt>
                              <dd className="tabular-nums text-foreground">
                                {v.line_count}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Consumed
                              </dt>
                              <dd className="tabular-nums text-foreground">
                                {v.forecast_total > 0
                                  ? formatPercent(
                                      (v.actuals_total / v.forecast_total) *
                                        100,
                                    )
                                  : '—'}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                Variance vs baseline
                              </dt>
                              <dd className="tabular-nums text-foreground">
                                {formatCurrency(v.variance)}
                              </dd>
                            </div>
                          </dl>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}

function SortHead({
  current,
  dir,
  k,
  toggle,
  label,
  align,
}: {
  current: SortKey;
  dir: 'asc' | 'desc';
  k: SortKey;
  toggle: (k: SortKey) => void;
  label: string;
  align?: 'right';
}) {
  const isActive = current === k;
  return (
    <TableHead
      className={cn(
        'cursor-pointer select-none',
        align === 'right' && 'text-right',
      )}
      onClick={() => toggle(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          <span className="text-[10px] opacity-70">
            {dir === 'asc' ? '▲' : '▼'}
          </span>
        ) : null}
      </span>
    </TableHead>
  );
}
