/**
 * v5 B2 — Simulator route tree.
 *
 * Replaces v4's `WhatIfSimulator` phase machine with a proper React
 * Router subtree mounted under `/simulator/*` from `App.tsx`. URL is
 * the source of truth — bookmarkable, back-button works.
 *
 * Routes:
 *  - `/`                                                 ScenarioManagerPage
 *  - `/scenarios/new`                                    redirects to manager
 *                                                        (Create modal opens
 *                                                        from there)
 *  - `/scenarios/:id`                                    ScenarioWorkspacePage
 *  - `/scenarios/:id/surface/:surfaceKey/:entityId?`     same workspace; T2
 *                                                        will read URL params
 *                                                        from inside the
 *                                                        sidebar/surface.
 *  - `/scenarios/:id/promote`                            T4 PromoteReviewPage
 *  - `/scenarios/:id/apply`                              ApplyConfirmModal
 *                                                        rendered on the
 *                                                        workspace via state
 *                                                        — for now redirect.
 *  - `/compare`                                          T3 selection page
 *  - `/compare/:idA/:idB[/:idC]`                         T3 ComparePage
 *  - `/compare/:ids/project/:projectId(/line/:lineKey)`  T3 drill-down levels
 *
 * PL persona is allowed read access (cannot create); CC Owner is
 * scoped. Backend enforces; frontend renders only what's permitted.
 */

import { Navigate, Route, Routes } from 'react-router-dom';
import { ScenarioManagerPage } from './manager/ScenarioManagerPage';
import { ScenarioWorkspacePage } from './workspace/ScenarioWorkspacePage';
import { ComparePlaceholder } from './compare/ComparePlaceholder';
import { PromotePlaceholder } from './promote/PromotePlaceholder';

export function SimulatorRouter() {
  return (
    <Routes>
      <Route index element={<ScenarioManagerPage />} />
      <Route
        path="scenarios/new"
        element={<Navigate to=".." replace />}
      />
      <Route path="scenarios/:id" element={<ScenarioWorkspacePage />} />
      <Route
        path="scenarios/:id/surface/:surfaceKey"
        element={<ScenarioWorkspacePage />}
      />
      <Route
        path="scenarios/:id/surface/:surfaceKey/:entityId"
        element={<ScenarioWorkspacePage />}
      />
      <Route path="scenarios/:id/promote" element={<PromotePlaceholder />} />
      <Route
        path="scenarios/:id/apply"
        element={<Navigate to=".." replace />}
      />
      <Route path="compare" element={<ComparePlaceholder />} />
      <Route path="compare/:idA/:idB" element={<ComparePlaceholder />} />
      <Route path="compare/:idA/:idB/:idC" element={<ComparePlaceholder />} />
      <Route
        path="compare/:idA/:idB/project/:projectId"
        element={<ComparePlaceholder />}
      />
      <Route
        path="compare/:idA/:idB/project/:projectId/line/:lineKey"
        element={<ComparePlaceholder />}
      />
      <Route path="*" element={<Navigate to="/simulator" replace />} />
    </Routes>
  );
}
