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
  is_change_or_run: 'change' | 'run' | string;
}

export interface ChargeableEntityListResponse {
  items: ChargeableEntityItem[];
  total: number;
}
