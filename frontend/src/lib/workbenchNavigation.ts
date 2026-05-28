/**
 * Workbench navigation helper.
 *
 * Service Workbench Wave C deprecates `?project=<id>` as a primary URL form
 * for the Workbench module — Wave A's alias resolver in `ProjectWorkbench`
 * stays as a safety net for stale bookmarks, but every in-app caller should
 * now navigate directly to `?entity=<chargeable_entity_id>` to avoid the
 * cosmetic redirect blink.
 *
 * Callers across `portfolio/**` and `capacity/**` that used to emit
 * `/workbench?project=<id>` should go through this helper instead:
 *
 *     await navigateToWorkbenchByProject(projectItem.project_id, navigate);
 *
 * The helper resolves the project's ChargeableEntity via the existing
 * `chargingApi.getEntityByProjectId` endpoint and navigates to the
 * canonical `?entity=` form. If resolution fails (rare — every demo
 * project has an entity) it falls back to the legacy `?project=` form
 * so the Wave A alias resolver picks it up.
 *
 * Plan reference: `track-b/let-s-start-working-on-distributed-cosmos.md`
 * §"Track B — `?project=` cross-module sweep".
 */
import type { NavigateFunction } from 'react-router-dom';
import { chargingApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';

export async function navigateToWorkbenchByProject(
  projectId: string,
  navigate: NavigateFunction,
): Promise<void> {
  try {
    const entity = await chargingApi.getEntityByProjectId(projectId);
    navigate(`/workbench?entity=${encodeURIComponent(entity.id)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Genuine "no entity for this project_id" — fall through to the
      // legacy alias so the Wave A alias resolver in ProjectWorkbench
      // can surface its own not-found state.
      navigate(`/workbench?project=${encodeURIComponent(projectId)}`);
      return;
    }
    // Transient failure (network, 5xx, CORS, JSON parse). Don't degrade
    // through the alias resolver — that would double-fail and confuse
    // the user. Land them on /workbench so they can retry manually.
    console.warn(
      '[navigateToWorkbenchByProject] failed to resolve project_id',
      projectId,
      err,
    );
    navigate('/workbench');
  }
}
