/**
 * ServiceOverviewTab — type-aware Workbench overview for Offerings and
 * Internal Services per Service Workbench Session 3 §3.4 / §3.5.
 *
 * 3×3 tile grid mirroring the project OverviewTab layout. Offerings get
 * all nine slots; Internal Services render eight tiles with an empty
 * 3,3 slot (offering hierarchy is meaningless for IS — they live under
 * the IT-functional hierarchy, not the offering tree).
 *
 * Data flow: ProjectWorkbench fetches the focal entity once for routing
 * dispatch and passes it down; each tile that needs additional data
 * fetches it itself with its own loading/error state. People + active
 * hierarchy are fetched at the tab level so the header tile (1,1) and
 * the offering hierarchy tile (3,3) share one network round-trip.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ServiceHeaderTile,
  ServiceCostSummaryTile,
  ServiceAllocationFlowTile,
  ServiceStage1DistributionTile,
  ServiceStage2BTCTile,
  ServiceResourcePlanTile,
  ServiceExternalCostsTile,
  ServiceFinancialHealthTile,
  ServiceOfferingHierarchyTile,
} from './tiles';
import {
  fetchActiveHierarchy,
  resolveNodePosition,
  type ActiveHierarchy,
  type NodePosition,
} from './hierarchyHelpers';
import { referenceApi } from '@/api/endpoints';
import type { ChargeableEntityItem, RefPerson } from '@/types/api';

interface Props {
  entity: ChargeableEntityItem;
}

export function ServiceOverviewTab({ entity }: Props) {
  const navigate = useNavigate();
  const [people, setPeople] = useState<RefPerson[]>([]);
  const [hierarchy, setHierarchy] = useState<ActiveHierarchy | null>(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);

  useEffect(() => {
    referenceApi
      .getPeople()
      .then((res) => setPeople(res.items))
      .catch(() => setPeople([]));
  }, []);

  // Single getActiveHierarchy() call per service-entity visit; used both
  // by the header tile (to resolve the hierarchy node's name) and the
  // offering hierarchy tile (for parent + sibling-count context). Pre-
  // review this fetch was duplicated.
  useEffect(() => {
    let cancelled = false;
    setHierarchyLoading(true);
    setHierarchyError(null);
    fetchActiveHierarchy()
      .then((h) => {
        if (!cancelled) setHierarchy(h);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setHierarchy(null);
          setHierarchyError(
            e instanceof Error ? e.message : 'Could not load hierarchy',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setHierarchyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const position: NodePosition | null = useMemo(() => {
    if (!hierarchy || !entity.hierarchy_node_id) return null;
    return resolveNodePosition(hierarchy, entity.hierarchy_node_id);
  }, [hierarchy, entity.hierarchy_node_id]);

  const ownerName = useMemo(() => {
    if (!entity.responsible_person_id) return null;
    return people.find((p) => p.id === entity.responsible_person_id)?.name ?? null;
  }, [entity.responsible_person_id, people]);

  const isOffering = entity.entity_type === 'Offering';

  return (
    <div className="space-y-6 min-w-0">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Row 1 */}
        <ServiceHeaderTile
          entity={entity}
          ownerName={ownerName}
          hierarchyName={position?.current_name ?? null}
        />
        <ServiceCostSummaryTile entityId={entity.id} />
        <ServiceAllocationFlowTile
          entityId={entity.id}
          onClick={() =>
            navigate(`/workbench/allocation-flow?entity=${entity.id}`)
          }
        />

        {/* Row 2 */}
        <ServiceStage1DistributionTile
          entityId={entity.id}
          onClick={() => navigate('/charging?section=distribution')}
        />
        <ServiceStage2BTCTile
          entityId={entity.id}
          entityType={entity.entity_type}
          toBusinessPct={entity.to_business_pct}
          onClick={() => navigate('/charging?section=btc')}
        />
        <ServiceResourcePlanTile />

        {/* Row 3 */}
        <ServiceExternalCostsTile />
        <ServiceFinancialHealthTile />
        {/* Tile 3,3 — Offering hierarchy is Offerings-only. Internal
            Services leave the slot empty (visual asymmetry on purpose
            per spec §3.4: the IT-functional hierarchy of an IS isn't
            an offering tree). */}
        {isOffering ? (
          <ServiceOfferingHierarchyTile
            hierarchyNodeId={entity.hierarchy_node_id}
            position={position}
            loading={hierarchyLoading}
            error={hierarchyError}
            onClick={() => navigate('/admin?section=portfolio_hierarchy')}
          />
        ) : (
          <div aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
