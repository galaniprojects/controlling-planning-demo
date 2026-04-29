/**
 * Shared rollup data hook for the F5 map + tree-table views per [F-RV-01..04].
 *
 * Loads everything once for the (year, version, entity_type) tuple and exposes:
 *  - per-entity effective costs (from /rollup?group_by=entity)
 *  - per-entity BTC profiles (charging-location splits)
 *  - charging-location metadata (region/country/division/code)
 *  - chargeable-entity metadata (name/identifier/type/responsible/hierarchy)
 *
 * The hook does the cross-product locally: amount(entity × cl) =
 * effective_cost × percentage / 100. This mirrors the backend's
 * `get_stage2_location_total` formula.
 */
import { useEffect, useMemo, useState } from 'react';
import { adminD3Api, chargingApi } from '@/api/endpoints';
import type {
  BTCProfileItem,
  ChargeableEntityItem,
  ChargeableEntityType,
  ChargingLocationItem,
  RollupListResponse,
} from '@/types/api';

export interface PerLocationCell {
  entity_id: string;
  entity_name: string;
  entity_type: ChargeableEntityType;
  identifier: string;
  charging_location_id: string;
  charging_location_code: string;
  charging_location_name: string;
  region_name: string | null;
  country_iso_code: string | null;
  country_name: string | null;
  division: string | null;
  effective_cost: number;
  percentage: number;
  amount_eur: number;
}

export interface UseChargingRollupResult {
  loading: boolean;
  error: string | null;
  refresh: () => void;

  // Raw lookups
  entities: ChargeableEntityItem[];
  entityById: Map<string, ChargeableEntityItem>;
  chargingLocations: ChargingLocationItem[];
  locationById: Map<string, ChargingLocationItem>;
  btcProfiles: BTCProfileItem[];
  effectiveCostByEntity: Map<string, number>;

  // Cross-product cells (one row per (entity × cl) where percentage > 0)
  cells: PerLocationCell[];

  // Aggregations
  byCountry: Map<string, { country_iso_code: string; country_name: string; total: number; cells: PerLocationCell[] }>;
  byRegion: Map<string, { region_name: string; total: number; cells: PerLocationCell[] }>;
  byDivision: Map<string, { division: string; total: number; cells: PerLocationCell[] }>;
  byChargingLocation: Map<string, {
    location: ChargingLocationItem;
    total: number;
    cells: PerLocationCell[];
  }>;

  totalEffective: number;
  totalAllocatedToBusinessLayer: number;  // Σ(cells.amount_eur)
}

interface Args {
  year: number;
  version?: string;
  entityType?: ChargeableEntityType | null;
}

export function useChargingRollupData({ year, version = 'forecast', entityType = null }: Args): UseChargingRollupResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entities, setEntities] = useState<ChargeableEntityItem[]>([]);
  const [chargingLocations, setChargingLocations] = useState<ChargingLocationItem[]>([]);
  const [btcProfiles, setBTCProfiles] = useState<BTCProfileItem[]>([]);
  const [rollup, setRollup] = useState<RollupListResponse | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    Promise.all([
      chargingApi.listEntities({
        is_active: true,
        ...(entityType ? { entity_type: entityType } : {}),
      }),
      adminD3Api.getChargingLocations(),
      chargingApi.listBTCProfiles({ year, status: 'active' }),
      chargingApi.getRollup({
        year,
        version,
        group_by: 'entity',
        ...(entityType ? { entity_type: entityType } : {}),
      }),
    ])
      .then(([ent, loc, btc, rl]) => {
        if (cancel) return;
        setEntities(ent.items);
        setChargingLocations(loc.items);
        setBTCProfiles(btc.items);
        setRollup(rl);
      })
      .catch((e: unknown) => {
        if (cancel) return;
        setError(e instanceof Error ? e.message : 'Load failed');
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [year, version, entityType, tick]);

  return useMemo<UseChargingRollupResult>(() => {
    const entityById = new Map<string, ChargeableEntityItem>();
    entities.forEach((e) => entityById.set(e.id, e));
    const locationById = new Map<string, ChargingLocationItem>();
    chargingLocations.forEach((l) => locationById.set(l.id, l));

    const effectiveCostByEntity = new Map<string, number>();
    rollup?.rows.forEach((r) => {
      effectiveCostByEntity.set(r.group_key, r.effective_cost);
    });

    // Cross-product cells (entity × cl) — only where the entity has a profile
    // line with a positive percentage. Skip entities not visible per the
    // current entity_type filter.
    const cells: PerLocationCell[] = [];
    btcProfiles.forEach((p) => {
      const ent = entityById.get(p.entity_id);
      if (!ent) return;
      const eff = effectiveCostByEntity.get(p.entity_id) ?? 0;
      // BTC applies to To-Business share only per [F-S2-08].
      const tbpFraction = (ent.to_business_pct || 0) / 100;
      const businessShare = eff * tbpFraction;
      p.lines.forEach((line) => {
        const cl = locationById.get(line.charging_location_id);
        if (!cl) return;
        const amount = businessShare * (line.percentage / 100);
        cells.push({
          entity_id: ent.id,
          entity_name: ent.name,
          entity_type: ent.entity_type,
          identifier: ent.identifier,
          charging_location_id: cl.id,
          charging_location_code: cl.code,
          charging_location_name: cl.name,
          region_name: cl.region_name,
          country_iso_code: cl.country_iso_code,
          country_name: cl.country_name,
          division: cl.division,
          effective_cost: eff,
          percentage: line.percentage,
          amount_eur: amount,
        });
      });
    });

    // Aggregate
    const byCountry = new Map<string, {
      country_iso_code: string; country_name: string; total: number; cells: PerLocationCell[];
    }>();
    const byRegion = new Map<string, {
      region_name: string; total: number; cells: PerLocationCell[];
    }>();
    const byDivision = new Map<string, {
      division: string; total: number; cells: PerLocationCell[];
    }>();
    const byChargingLocation = new Map<string, {
      location: ChargingLocationItem; total: number; cells: PerLocationCell[];
    }>();

    cells.forEach((c) => {
      const cKey = c.country_iso_code ?? '__unknown__';
      const cBucket = byCountry.get(cKey) ?? {
        country_iso_code: c.country_iso_code ?? '',
        country_name: c.country_name ?? '(Unassigned)',
        total: 0,
        cells: [],
      };
      cBucket.total += c.amount_eur;
      cBucket.cells.push(c);
      byCountry.set(cKey, cBucket);

      const rKey = c.region_name ?? '__unknown__';
      const rBucket = byRegion.get(rKey) ?? {
        region_name: c.region_name ?? '(Unassigned)',
        total: 0,
        cells: [],
      };
      rBucket.total += c.amount_eur;
      rBucket.cells.push(c);
      byRegion.set(rKey, rBucket);

      const dKey = c.division ?? '__unknown__';
      const dBucket = byDivision.get(dKey) ?? {
        division: c.division ?? '(Unassigned)',
        total: 0,
        cells: [],
      };
      dBucket.total += c.amount_eur;
      dBucket.cells.push(c);
      byDivision.set(dKey, dBucket);

      const lKey = c.charging_location_id;
      const lBucket = byChargingLocation.get(lKey) ?? {
        location: locationById.get(lKey)!,
        total: 0,
        cells: [],
      };
      lBucket.total += c.amount_eur;
      lBucket.cells.push(c);
      byChargingLocation.set(lKey, lBucket);
    });

    const totalEffective = Array.from(effectiveCostByEntity.values()).reduce((s, v) => s + v, 0);
    const totalAllocatedToBusinessLayer = cells.reduce((s, c) => s + c.amount_eur, 0);

    return {
      loading,
      error,
      refresh: () => setTick((t) => t + 1),
      entities,
      entityById,
      chargingLocations,
      locationById,
      btcProfiles,
      effectiveCostByEntity,
      cells,
      byCountry,
      byRegion,
      byDivision,
      byChargingLocation,
      totalEffective,
      totalAllocatedToBusinessLayer,
    };
  }, [loading, error, entities, chargingLocations, btcProfiles, rollup]);
}
