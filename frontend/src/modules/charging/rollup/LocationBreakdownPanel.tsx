import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { chargingApi } from '@/api/endpoints';
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters';
import type { LocationBreakdownResponse } from '@/types/api';

interface Props {
  chargingLocationId: string;
  year: number;
  version?: string;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  Project: 'Project',
  Offering: 'Offering',
  InternalService: 'Internal Service',
};

export function LocationBreakdownPanel({
  chargingLocationId,
  year,
  version = 'forecast',
}: Props) {
  const [data, setData] = useState<LocationBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    chargingApi
      .getLocationBreakdown({ cl_id: chargingLocationId, year, version })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load breakdown');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chargingLocationId, year, version]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!data) return null;

  const subtitleParts = [data.charging_location_code];
  if (data.country_iso_code) subtitleParts.push(data.country_iso_code);
  if (data.region_name) subtitleParts.push(data.region_name);
  if (data.division) subtitleParts.push(data.division);

  return (
    <div className="space-y-5 text-sm">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Charging location
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {subtitleParts.join(' · ')}
        </p>
        <div className="pt-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Total flowing through this location ({data.year})
          </p>
          <p className="font-mono text-xl tabular-nums text-foreground">
            {formatCurrency(data.total_amount_eur)}
          </p>
        </div>
      </header>

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
          Legal entities at this location ({data.legal_entities.length})
        </h3>
        {data.legal_entities.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No legal entities recorded at this location.
          </p>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="flex flex-wrap gap-1.5">
              {data.legal_entities.map((le) => (
                <Tooltip key={le.id}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="font-mono text-[11px] cursor-default"
                    >
                      {le.code}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{le.name}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        )}
        <p className="text-[11px] text-muted-foreground">
          Informational — BTC Stage 2 splits to a charging location, not to a
          legal entity.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
          Chargeable entities flowing in ({data.chargeable_entities.length})
        </h3>
        {data.chargeable_entities.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No chargeable entities flow into this location.
          </p>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Entity</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.chargeable_entities.map((row) => (
                  <TableRow key={row.entity_id}>
                    <TableCell className="py-2 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground text-xs">
                          {row.name}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="font-mono">{row.identifier}</span>
                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal px-1.5 py-0"
                          >
                            {ENTITY_TYPE_LABELS[row.entity_type] ?? row.entity_type}
                          </Badge>
                          <Badge
                            variant={row.is_change_or_run === 'Run' ? 'secondary' : 'default'}
                            className="text-[10px] font-normal px-1.5 py-0"
                          >
                            {row.is_change_or_run}
                          </Badge>
                          {row.doi !== null && row.doi !== undefined ? (
                            <span className="font-mono">DoI {row.doi}</span>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums text-xs">
                      {formatCurrencyCompact(row.amount_eur)}
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono tabular-nums text-xs text-muted-foreground">
                      {row.share_pct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
