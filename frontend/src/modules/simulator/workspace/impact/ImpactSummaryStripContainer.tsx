/**
 * Container that wires the impact strip to T1's `useScenarioContext()`.
 *
 * Mounted by `ScenarioWorkspacePage` (T1-owned) inside Zone 2 of the
 * three-zone layout. Keeps the presentational `ImpactSummaryStrip`
 * decoupled from context plumbing so it can be unit-tested with stubbed
 * data.
 */

import { useScenarioContext } from '../../useScenarioContext';
import { narrowImpact } from '../../lib/impactTypes';
import { ImpactSummaryStrip } from './ImpactSummaryStrip';

export function ImpactSummaryStripContainer() {
  const { impact, loading, stale, tier3Visible } = useScenarioContext();
  return (
    <ImpactSummaryStrip
      impact={narrowImpact(impact)}
      loading={loading}
      stale={stale}
      tier3Visible={tier3Visible}
    />
  );
}
