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
 * hierarchy are fetched at the tab level so the header tile (1,1) gets
 * resolved owner + hierarchy labels in a single network round-trip.
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
import { referenceApi, adminApi } from '@/api/endpoints';
import type { ChargeableEntityItem, RefPerson } from '@/types/api';

interface Props {
  entity: ChargeableEntityItem;
}

interface HierarchyEntity {
  id: string;
  name: string;
  children: unknown[];
}

function findHierarchyName(
  entities: HierarchyEntity[],
  targetId: string,
): string | null {
  for (const e of entities) {
    if (e.id === targetId) return e.name;
    const children = (e.children as HierarchyEntity[]) ?? [];
    const hit = findHierarchyName(children, targetId);
    if (hit) return hit;
  }
  return null;
}

export function ServiceOverviewTab({ entity }: Props) {
  const navigate = useNavigate();
  const [people, setPeople] = useState<RefPerson[]>([]);
  const [hierarchyName, setHierarchyName] = useState<string | null>(null);

  useEffect(() => {
    referenceApi
      .getPeople()
      .then((res) => setPeople(res.items))
      .catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    if (!entity.hierarchy_node_id) {
      setHierarchyName(null);
      return;
    }
    let cancelled = false;
    adminApi
      .getActiveHierarchy()
      .then((res) => {
        if (cancelled) return;
        const entities = res.entities as unknown as HierarchyEntity[];
        setHierarchyName(findHierarchyName(entities, entity.hierarchy_node_id!));
      })
      .catch(() => {
        if (!cancelled) setHierarchyName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entity.hierarchy_node_id]);

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
          hierarchyName={hierarchyName}
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
            onClick={() => navigate('/admin?section=portfolio_hierarchy')}
          />
        ) : (
          <div aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
