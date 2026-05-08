/**
 * ExternalCostSection — v5.2 W4 Track A (Session 6a).
 *
 * Displayed below the resource role sections for each
 * ResourceRequest with request_type='external_cost'.
 *
 * Each row shows: cost type, amount/month, period, + Confirm / Decline pair.
 * No person assignment required.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2 "External cost requests"
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { capacityApi } from '@/api/endpoints';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

function fmtMonthShort(iso: string): string {
  const [year, mon] = iso.split('-');
  const idx = parseInt(mon, 10) - 1;
  return `${MONTH_NAMES[idx] ?? mon} ${year}`;
}

/** European number formatting: 14400 → "14.400" */
function fmtAmount(amount: number): string {
  return amount.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ---------------------------------------------------------------------------
// Single external cost row
// ---------------------------------------------------------------------------

interface ExternalCostRowProps {
  ccId: string;
  requestId: number;
  costType: string;
  amountPerMonth: number;
  periodStart: string;
  periodEnd: string;
  initialStatus: string;
}

function ExternalCostRow({
  ccId,
  requestId,
  costType,
  amountPerMonth,
  periodStart,
  periodEnd,
  initialStatus,
}: ExternalCostRowProps) {
  const [status, setStatus] = useState(initialStatus);
  const [decliningMode, setDecliningMode] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await capacityApi.confirmRequest(ccId, requestId);
      setStatus('confirmed');
    } catch {
      // Silently ignore — the user can retry
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!declineReason.trim()) return;
    setSubmitting(true);
    try {
      await capacityApi.declineRequest(ccId, requestId, declineReason);
      setStatus('declined');
      setDecliningMode(false);
    } catch {
      // Silently ignore
    } finally {
      setSubmitting(false);
    }
  };

  const isDone = status === 'confirmed' || status === 'declined';

  return (
    <div className="rounded-sm border border-border bg-muted/20 p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{costType}</span>
          <span className="text-muted-foreground">
            €{fmtAmount(amountPerMonth)}/mo · {fmtMonthShort(periodStart)} – {fmtMonthShort(periodEnd)}
          </span>
        </div>

        {!isDone && !decliningMode && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={handleConfirm}
              disabled={submitting}
            >
              Confirm
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setDecliningMode(true)}
              disabled={submitting}
            >
              Decline
            </Button>
          </div>
        )}

        {isDone && (
          <span
            className={
              status === 'confirmed'
                ? 'shrink-0 text-[11px] font-medium text-green-600 dark:text-green-400'
                : 'shrink-0 text-[11px] font-medium text-red-600 dark:text-red-400'
            }
          >
            {status === 'confirmed' ? 'Confirmed' : 'Declined'}
          </span>
        )}
      </div>

      {decliningMode && !isDone && (
        <div className="mt-2 space-y-1.5">
          <Textarea
            placeholder="Reason for declining…"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            className="h-16 resize-none text-xs"
          />
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-[11px]"
              onClick={handleDecline}
              disabled={submitting || !declineReason.trim()}
            >
              Confirm decline
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => { setDecliningMode(false); setDeclineReason(''); }}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section container
// ---------------------------------------------------------------------------

interface ExternalCostRequest {
  id: number;
  role_or_cost_type: string;
  hours_or_amount: number;
  period_start: string;
  period_end: string;
  status: string;
}

interface ExternalCostSectionProps {
  ccId: string;
  requests: ExternalCostRequest[];
}

export function ExternalCostSection({ ccId, requests }: ExternalCostSectionProps) {
  if (requests.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        External Costs
      </p>
      <div className="space-y-1.5">
        {requests.map((req) => (
          <ExternalCostRow
            key={req.id}
            ccId={ccId}
            requestId={req.id}
            costType={req.role_or_cost_type}
            amountPerMonth={req.hours_or_amount}
            periodStart={req.period_start}
            periodEnd={req.period_end}
            initialStatus={req.status}
          />
        ))}
      </div>
    </div>
  );
}
