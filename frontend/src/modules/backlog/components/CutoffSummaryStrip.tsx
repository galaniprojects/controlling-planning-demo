/**
 * CutoffSummaryStrip — KPI strip showing envelope, Type 3 total, misalignment
 * count, and jump buttons. [A-BK-16][A-BK-17]
 */

import { ArrowDown } from 'lucide-react';
import type { CutoffLines, RankingConfigSnapshot } from '@/types/api';

interface Props {
  cutoff: CutoffLines;
  config: RankingConfigSnapshot;
  onJumpShouldBe?: () => void;
  onJumpReality?: () => void;
}

function fmtEur(n: number): string {
  return (
    '€' +
    Math.round(n / 1_000_000)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.') +
    'M'
  );
}

export function CutoffSummaryStrip({
  cutoff,
  config,
  onJumpShouldBe,
  onJumpReality,
}: Props) {
  const hasMisalignment =
    cutoff.misalignment_zone_start !== null &&
    cutoff.misalignment_zone_end !== null;

  const misalignmentCount = hasMisalignment
    ? cutoff.misalignment_zone_end! - cutoff.misalignment_zone_start! + 1
    : 0;

  return (
    <div className="flex flex-wrap items-stretch gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <KPICell
        label="Budget envelope"
        value={fmtEur(cutoff.total_available_budget)}
      />
      <Divider />
      <KPICell
        label="Contestable"
        value={fmtEur(cutoff.contestable_envelope)}
        subtext={
          cutoff.type3_pre_funded_total > 0
            ? `After ${fmtEur(cutoff.type3_pre_funded_total)} Type 3 pre-funded`
            : undefined
        }
      />
      <Divider />
      <KPICell
        label="Should-be cutoff"
        value={
          cutoff.should_be_cutoff_rank !== null
            ? `Rank ${cutoff.should_be_cutoff_rank}`
            : 'All fit'
        }
        action={
          cutoff.should_be_cutoff_rank !== null ? (
            <JumpButton onClick={onJumpShouldBe} label="Jump" />
          ) : undefined
        }
      />
      <Divider />
      <KPICell
        label="Reality cutoff"
        value={
          cutoff.reality_cutoff_rank !== null
            ? `Rank ${cutoff.reality_cutoff_rank}`
            : 'All fit'
        }
        action={
          cutoff.reality_cutoff_rank !== null ? (
            <JumpButton onClick={onJumpReality} label="Jump" />
          ) : undefined
        }
      />
      {hasMisalignment ? (
        <>
          <Divider />
          <KPICell
            label="Misaligned projects"
            value={String(misalignmentCount)}
            highlight="amber"
          />
        </>
      ) : null}
      <Divider />
      <KPICell
        label="Horizon"
        value={`${config.horizon_months} months`}
      />
    </div>
  );
}

function KPICell({
  label,
  value,
  subtext,
  action,
  highlight,
}: {
  label: string;
  value: string;
  subtext?: string;
  action?: React.ReactNode;
  highlight?: 'amber';
}) {
  return (
    <div className="flex min-w-[120px] flex-col justify-center gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span
          className={
            highlight === 'amber'
              ? 'text-sm font-semibold text-amber-600 dark:text-amber-400'
              : 'text-sm font-semibold text-foreground'
          }
        >
          {value}
        </span>
        {action}
      </div>
      {subtext ? (
        <span className="text-xs text-muted-foreground">{subtext}</span>
      ) : null}
    </div>
  );
}

function Divider() {
  return <div className="w-px self-stretch bg-border" aria-hidden />;
}

function JumpButton({
  onClick,
  label,
}: {
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowDown className="size-3" aria-hidden />
      {label}
    </button>
  );
}
