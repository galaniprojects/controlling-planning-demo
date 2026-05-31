/**
 * Run Portfolio types — mirrors backend `schemas/chargeable_entity.py`.
 *
 * The Run Portfolio sub-module per [E-11] aggregates Project (DoI 5),
 * Offering, and InternalService entities. These types describe the API
 * shape served by `GET /api/charging/chargeable-entities`.
 */

export type ChargeableEntityType = 'Project' | 'Offering' | 'InternalService';

export interface ChargeableEntityItem {
  id: string;
  entity_type: ChargeableEntityType;
  identifier: string;
  name: string;
  description: string | null;
  hierarchy_node_id: string | null;
  responsible_person_id: string | null;
  to_business_pct: number;
  annual_cost: number | null;
  project_id: string | null;
  termination_month: string | null;
  is_active: boolean;
  is_change_or_run: 'Change' | 'Run';
}

export interface ChargeableEntityListResponse {
  items: ChargeableEntityItem[];
  total: number;
}

/**
 * Run Cost Distributions — Rollup-mode org tree (VIPER Wave 5, spec §10.2/§10.3).
 *
 * Hierarchy-level group-bys (LoB / Program) are served by
 * `GET /api/portfolio/run/cost-tree?group_by=lob|program&node=<id>&year=`.
 * Run entities attach at mixed levels — a Program-attached entity rolls up into
 * its parent LoB when grouping by LoB; an entity attached above the grouping
 * level sits as a direct leaf of its ancestor node (node-vs-level rule). The
 * Region/Division/Country group-bys reuse `GET /api/charging/rollup` instead.
 */
export type RunCostTreeGroupBy = 'lob' | 'program';

export type RunCostTreeNodeKind = 'group' | 'entity';

export interface RunCostTreeNode {
  /** grouping_entities id (kind=group) or chargeable_entities id (kind=entity). */
  id: string;
  name: string;
  kind: RunCostTreeNodeKind;
  /** hierarchy level id for groups (e.g. get-lob / get-prog); null for entities. */
  level: string | null;
  /** human level name for groups (e.g. "Line of Business"); null for entities. */
  level_label: string | null;
  /** Run entity subtype; only set when kind=entity. */
  entity_type: Exclude<ChargeableEntityType, 'Project'> | null;
  /** Run entity identifier; only set when kind=entity. */
  identifier: string | null;
  /** Own annual cost of a leaf entity (0 for group rows). */
  annual_cost: number;
  /** Cost aggregated over this node and all descendants. */
  rolled_cost: number;
  /** Count of Run entities at/under this node. */
  entity_count: number;
  children: RunCostTreeNode[];
}

export interface RunCostTreeResponse {
  group_by: RunCostTreeGroupBy;
  year: number;
  grand_total: number;
  nodes: RunCostTreeNode[];
}
