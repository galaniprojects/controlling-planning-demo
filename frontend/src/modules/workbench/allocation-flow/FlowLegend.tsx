/**
 * FlowLegend — collapsible legend pinned to the top-right of the SVG
 * canvas per `[AF-08]`. Eight items: three subtype strips, the focal
 * accent border, the two business pill variants (solid + dashed),
 * the self-retained badge, and the edge thickness scale.
 *
 * Open/collapsed state is owned by the parent reducer and persisted
 * to sessionStorage by `useAllocationFlowState`.
 */
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FlowLegendProps {
  open: boolean;
  onToggle: () => void;
  className?: string;
}

export function FlowLegend({ open, onToggle, className }: FlowLegendProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-md text-foreground',
        'w-[240px]',
        className,
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2',
          'text-[11px] font-semibold uppercase tracking-wider text-foreground',
          'hover:bg-accent rounded-t-lg',
          !open && 'rounded-b-lg',
        )}
        aria-expanded={open}
      >
        <span>Legend</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2.5 space-y-2">
          <LegendRow swatch={<EntityStripSwatch tone="blue" />} label="Project" />
          <LegendRow
            swatch={<EntityStripSwatch tone="purple" />}
            label="Offering"
          />
          <LegendRow
            swatch={<EntityStripSwatch tone="violet" />}
            label="Internal Service"
          />
          <LegendRow
            swatch={<FocalSwatch />}
            label="Focal entity (current)"
          />
          <LegendRow
            swatch={<BusinessSwatch dashed={false} />}
            label="Charging location"
          />
          <LegendRow
            swatch={<BusinessSwatch dashed />}
            label="More locations (collapsed)"
          />
          <LegendRow
            swatch={<SelfRetainedSwatch />}
            label="Self-retained share"
          />
          <LegendRow
            swatch={<EdgeThicknessSwatch />}
            label="Edge thickness ∝ €"
          />
        </div>
      )}
    </div>
  );
}

/** Floating "Show legend" trigger when the legend is collapsed. */
export function FlowLegendCollapsedTrigger({
  onOpen,
  className,
}: {
  onOpen: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onOpen}
      className={cn('h-7 text-[11px]', className)}
    >
      Show legend
    </Button>
  );
}

function LegendRow({
  swatch,
  label,
}: {
  swatch: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-foreground">
      <div className="shrink-0 w-12 h-5 flex items-center">{swatch}</div>
      <span className="truncate">{label}</span>
    </div>
  );
}

const STRIP_CLASS: Record<'blue' | 'purple' | 'violet', string> = {
  blue: 'bg-blue-100 dark:bg-blue-900/30',
  purple: 'bg-purple-100 dark:bg-purple-900/30',
  violet: 'bg-violet-100 dark:bg-violet-900/30',
};

function EntityStripSwatch({
  tone,
}: {
  tone: 'blue' | 'purple' | 'violet';
}) {
  return (
    <div className="relative w-12 h-5 rounded border border-border bg-card overflow-hidden">
      <div
        aria-hidden
        className={cn('absolute inset-y-0 left-0 w-1.5', STRIP_CLASS[tone])}
      />
    </div>
  );
}

function FocalSwatch() {
  return (
    <div className="w-12 h-5 rounded border-2 border-orange-500 bg-orange-50/40 dark:bg-orange-900/10" />
  );
}

function BusinessSwatch({ dashed }: { dashed: boolean }) {
  return (
    <div
      className={cn(
        'w-12 h-4 rounded-full bg-amber-100 dark:bg-amber-900/30',
        dashed
          ? 'border border-dashed border-amber-400'
          : 'border border-amber-300 dark:border-amber-800/60',
      )}
    />
  );
}

function SelfRetainedSwatch() {
  return (
    <div className="w-12 h-4 rounded border border-dashed border-muted-foreground/50 bg-background" />
  );
}

function EdgeThicknessSwatch() {
  return (
    <svg width="48" height="20" viewBox="0 0 48 20">
      <line
        x1="2"
        y1="6"
        x2="46"
        y2="6"
        strokeWidth="1.5"
        style={{ stroke: 'var(--muted-foreground)' }}
      />
      <line
        x1="2"
        y1="13"
        x2="46"
        y2="13"
        strokeWidth="5"
        strokeLinecap="round"
        style={{ stroke: 'var(--primary)' }}
      />
    </svg>
  );
}
