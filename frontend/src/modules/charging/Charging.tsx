/**
 * Charging & Allocations top-level module per [E-10].
 *
 * Four primary surfaces (sidebar) per [F-RV-01]:
 *  1. Inter-service Distribution editor [F-S1-03]
 *  2. BTC Profile editor                [F-S2-02..07]
 *  3. Location Cost Rollup (map + table) [F-RV-03..04]   ← F5
 *  4. Report Builder integration         [F-RV-01]       ← F5
 *
 * Sidebar pattern matches the Cluster D admin module per [E-07c]. Section
 * persists in the `?section=` query param so deep links and back/forward work.
 *
 * Access policy [A-05] / [F-AC-01]:
 *  - **Controller** (Anna Meier) — full access, may create / edit / delete
 *    distributions, BTC profiles, rollups.
 *  - **CC Owner / Project Lead / Executive** — read-only. The module shell
 *    mounts and read endpoints render normally; mutation buttons within
 *    subsections are progressively hidden as the relevant subsection
 *    components add the `readOnly` prop. Backend enforcement
 *    (`require_role("controller")` on POST/PUT/DELETE) is the source of
 *    truth — even if a stray edit control slips through, the API will
 *    reject the request with 403.
 *
 * TODO [A-05]: thread `readOnly` (computed from `useRole().context?.role`)
 * into the four sub-views so Save / Delete / Add buttons hide for
 * non-controllers. Out of scope for the wave-1 frontend gate flip; the
 * backend role gate (Teammate C) already prevents mutation regardless of
 * UI state.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { ChargingSidebar, type ChargingSection } from './ChargingSidebar';
import { DistributionListView } from './distribution/DistributionListView';
import { BTCProfileListView } from './btc/BTCProfileListView';
import { RollupView } from './rollup/RollupView';
import { ReportingPanel } from './reports/ReportingPanel';

const VALID_SECTIONS: ChargingSection[] = ['distribution', 'btc', 'rollup', 'reports'];

function parseSection(value: string | null): ChargingSection {
  if (value && (VALID_SECTIONS as string[]).includes(value)) {
    return value as ChargingSection;
  }
  return 'distribution';
}

export function Charging() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [section, setSection] = useState<ChargingSection>(
    parseSection(searchParams.get('section')),
  );

  // Sync state ← url (back / forward navigation)
  useEffect(() => {
    const next = parseSection(searchParams.get('section'));
    if (next !== section) setSection(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSelect = (next: ChargingSection) => {
    setSection(next);
    const params = new URLSearchParams(searchParams);
    params.set('section', next);
    setSearchParams(params, { replace: true });
  };

  const renderSection = () => {
    switch (section) {
      case 'distribution':
        return <DistributionListView />;
      case 'btc':
        return <BTCProfileListView />;
      case 'rollup':
        return <RollupView />;
      case 'reports':
        return <ReportingPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <ModuleHeader
        title="Charging & Allocations"
        subtitle="Inter-service distribution, BTC profiles, and location cost rollup for the IT portfolio."
        actions={<ModuleGuideButton moduleId="charging" />}
      />

      <div className="flex gap-6 items-start">
        <ChargingSidebar selected={section} onSelect={handleSelect} />
        <div className="flex-1 min-w-0">{renderSection()}</div>
      </div>
    </div>
  );
}
