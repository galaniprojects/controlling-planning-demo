/**
 * Re-export shim — the canonical component lives in
 * `@/components/shared/LocationLabel` since v5 Session E8. This file is
 * kept as a transition aid for in-flight imports and will be removed in
 * a follow-on cleanup pass once all callers are migrated.
 */
export { LocationLabel } from '@/components/shared/LocationLabel';
export type { LocationKind } from '@/components/shared/LocationLabel';
