/**
 * Translator between the W2 frontend `CapacityScope` shape and the W1
 * backend scope vocabulary used by the dashboard / hotspots / forecast /
 * inbox endpoints.
 *
 * Frontend (CapacityScopeContext):
 *   { kind: 'all_ccs' | 'my_cc' | 'location' | 'hierarchy', id?: string }
 *   plus a separate `ccId` for the Controller "My CC" dropdown selection
 *   and CC-Owner's pinned CC.
 *
 * Backend (services/capacity_dashboard._parse_scope):
 *   'all' | 'cost_center:<id>' | 'location:<id>' | 'hierarchy:<id>'
 *
 * Spec refs:
 *   - guides/Capacity_Module_Redesign_Spec.md §2 (scope model)
 *   - guides/Capacity_Module_Redesign_Spec.md §11.10 (dashboard scope)
 */
import type { CapacityScope } from '@/contexts/CapacityScopeContext';

/**
 * Convert a frontend scope (plus the active CC selection for `my_cc`) into
 * the backend scope-string accepted by `?scope=…` query params.
 *
 * `my_cc` requires a non-null `ccId`; if it's null we fall back to `'all'`
 * so the API call still succeeds in transitional states (e.g., a Controller
 * who hasn't picked a CC yet).
 */
export function scopeToApiParam(
  scope: CapacityScope,
  ccId: string | null,
): string {
  switch (scope.kind) {
    case 'all_ccs':
      return 'all';
    case 'my_cc':
      return ccId ? `cost_center:${ccId}` : 'all';
    case 'location':
      return scope.id ? `location:${scope.id}` : 'all';
    case 'hierarchy':
      return scope.id ? `hierarchy:${scope.id}` : 'all';
    default:
      return 'all';
  }
}
