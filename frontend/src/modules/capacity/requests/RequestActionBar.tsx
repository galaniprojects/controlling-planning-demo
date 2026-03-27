import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { capacityApi } from '@/api/endpoints';
import { cn } from '@/lib/utils';
import type { CapacityRequestItem } from '@/types/api';

type ActionMode = 'idle' | 'confirm' | 'partial' | 'counter' | 'decline';

interface RequestActionBarProps {
  ccId: string;
  request: CapacityRequestItem;
  selectedPersonId: string | null;
  onActionComplete: () => void;
}

export function RequestActionBar({
  ccId,
  request,
  selectedPersonId,
  onActionComplete,
}: RequestActionBarProps) {
  const [mode, setMode] = useState<ActionMode>('idle');
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [adjustedValue, setAdjustedValue] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const isPending = request.status === 'pending';
  const isResource = request.request_type === 'resource';

  const reset = () => {
    setMode('idle');
    setText('');
    setAdjustedValue('');
    setResult(null);
  };

  const handleConfirm = async () => {
    if (isResource && !selectedPersonId) {
      setResult('Please select a person to assign before confirming.');
      return;
    }
    setLoading(true);
    try {
      await capacityApi.confirmRequest(ccId, request.id, selectedPersonId ?? undefined);
      setResult('Request confirmed successfully.');
      setTimeout(() => {
        reset();
        onActionComplete();
      }, 1000);
    } catch {
      setResult('Failed to confirm request.');
    } finally {
      setLoading(false);
    }
  };

  const handlePartialFulfill = async () => {
    const val = parseFloat(adjustedValue);
    if (isNaN(val) || val <= 0) {
      setResult('Please enter a valid adjusted value.');
      return;
    }
    setLoading(true);
    try {
      await capacityApi.partiallyFulfill(ccId, request.id, val, selectedPersonId ?? undefined);
      setResult('Request partially fulfilled.');
      setTimeout(() => {
        reset();
        onActionComplete();
      }, 1000);
    } catch {
      setResult('Failed to partially fulfill request.');
    } finally {
      setLoading(false);
    }
  };

  const handleCounterPropose = async () => {
    if (!text.trim()) {
      setResult('Please enter an explanation.');
      return;
    }
    setLoading(true);
    try {
      await capacityApi.counterPropose(ccId, request.id, text.trim());
      setResult('Counter-proposal submitted.');
      setTimeout(() => {
        reset();
        onActionComplete();
      }, 1000);
    } catch {
      setResult('Failed to submit counter-proposal.');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!text.trim()) {
      setResult('Please provide a reason.');
      return;
    }
    setLoading(true);
    try {
      await capacityApi.declineRequest(ccId, request.id, text.trim());
      setResult('Request declined.');
      setTimeout(() => {
        reset();
        onActionComplete();
      }, 1000);
    } catch {
      setResult('Failed to decline request.');
    } finally {
      setLoading(false);
    }
  };

  if (!isPending) {
    return (
      <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        This request has already been processed ({request.status}).
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      {mode === 'idle' && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setMode('confirm')}>
            Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode('partial')}>
            Partially Fulfill
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode('counter')}>
            Counter-Propose
          </Button>
          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => setMode('decline')}>
            Decline
          </Button>
        </div>
      )}

      {mode === 'confirm' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {isResource
              ? selectedPersonId
                ? 'Confirm this request and assign the selected person?'
                : 'Select a person from the availability table above, then confirm.'
              : 'Confirm this external cost request?'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleConfirm} disabled={loading}>
              {loading ? 'Confirming...' : 'Confirm Request'}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} disabled={loading}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'partial' && (
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            Adjusted {isResource ? 'hours/month' : 'amount/month'}:
          </label>
          <Input
            type="number"
            placeholder={String(request.hours_or_amount)}
            value={adjustedValue}
            onChange={(e) => setAdjustedValue(e.target.value)}
            className="w-48"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePartialFulfill} disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Partial'}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} disabled={loading}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'counter' && (
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Counter-proposal explanation:</label>
          <Textarea
            placeholder="Describe your alternative proposal..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCounterPropose} disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Counter-Proposal'}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} disabled={loading}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'decline' && (
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Reason for declining:</label>
          <Textarea
            placeholder="Provide a reason for declining..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={handleDecline} disabled={loading}>
              {loading ? 'Declining...' : 'Decline Request'}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} disabled={loading}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {result && (
        <p className={cn(
          'text-sm',
          result.includes('Failed') || result.includes('Please') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
        )}>
          {result}
        </p>
      )}
    </div>
  );
}
