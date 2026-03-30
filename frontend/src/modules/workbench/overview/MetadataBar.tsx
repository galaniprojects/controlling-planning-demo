import { Badge } from '@/components/ui/badge';
import { ragBgColor } from '@/lib/rag';
import { cn } from '@/lib/utils';
import type { ProjectMetadata } from '@/types/api';

interface Props {
  metadata: ProjectMetadata;
}

export function MetadataBar({ metadata }: Props) {
  // Timeline progress
  let timelinePct = 0;
  if (metadata.timeline.start && metadata.timeline.end) {
    const start = new Date(metadata.timeline.start + '-01');
    const end = new Date(metadata.timeline.end + '-01');
    const now = new Date('2026-02-15');
    const total = end.getTime() - start.getTime();
    if (total > 0) {
      timelinePct = Math.max(
        0,
        Math.min(100, ((now.getTime() - start.getTime()) / total) * 100),
      );
    }
  }

  return (
    <div className="space-y-3 p-4 bg-card border border-border rounded-lg">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">
          {metadata.name}
        </h2>
        {metadata.rag && (
          <Badge className={cn('text-xs capitalize', ragBgColor(metadata.rag))}>
            {metadata.rag}
          </Badge>
        )}
        <Badge variant="outline" className="text-xs capitalize">
          {metadata.status}
        </Badge>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {metadata.hierarchy_path && metadata.hierarchy_path.length > 0 ? (
          <span className="flex items-center gap-1">
            {metadata.hierarchy_path.map((seg: { type_name: string; entity_name: string }, i: number) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground/40">&rsaquo;</span>}
                <span>{seg.entity_name}</span>
              </span>
            ))}
          </span>
        ) : (
          <span>{metadata.lob}</span>
        )}
        {metadata.pl_name && <span>PL: {metadata.pl_name}</span>}
      </div>

      {/* Timeline bar */}
      {metadata.timeline.start && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{metadata.timeline.start}</span>
            <span>{metadata.timeline.end || '?'}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${timelinePct}%` }}
            />
          </div>
          {metadata.timeline.projected_end &&
            metadata.timeline.projected_end !== metadata.timeline.end && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Projected end: {metadata.timeline.projected_end}
              </p>
            )}
        </div>
      )}
    </div>
  );
}
