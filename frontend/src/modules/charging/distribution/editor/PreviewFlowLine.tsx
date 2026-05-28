/**
 * Vertical connector line between two nodes in the AllocationPreviewPanel.
 * Width scales with the percentage via `previewLineWidth` (bounded
 * 1px..21px). Spec §5.7 — "connector lines, thickness scaled to %".
 *
 * Edited edges render in the accent (orange/primary) colour to highlight
 * the in-flight change; unedited edges use a muted neutral.
 */
import { cn } from '@/lib/utils';

interface Props {
  widthPx: number;
  heightPx?: number;
  emphasised?: boolean;
}

export function PreviewFlowLine({
  widthPx,
  heightPx = 18,
  emphasised,
}: Props) {
  return (
    <div
      className="flex justify-center"
      style={{ height: `${heightPx}px` }}
      aria-hidden
    >
      <div
        className={cn(
          'rounded-sm transition-all',
          emphasised
            ? 'bg-primary'
            : 'bg-muted-foreground/30 dark:bg-muted-foreground/40',
        )}
        style={{
          width: `${widthPx}px`,
          height: '100%',
        }}
      />
    </div>
  );
}
