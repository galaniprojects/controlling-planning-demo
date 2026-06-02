/**
 * Workbench Overview tile (1,1) — Project Header per `[E-04b]`.
 *
 * Identity card: project name, status badge, RAG dot, pipeline stage badge,
 * DoI badge, project type badge, and budget t-shirt size. Static — no
 * navigation per spec.
 */
import { Badge } from '@/components/ui/badge';
import { ActionCard } from '@/components/shared/ActionCard';
import { PipelineStageBadge } from '@/components/shared/PipelineStageBadge';
import { DoIBadge } from '@/components/shared/DoIBadge';
import { cn } from '@/lib/utils';
import { ragBgColor } from '@/lib/rag';
import { usePipelineState } from '@/hooks/usePipelineState';
import { techNavigatorApi } from '@/api/endpoints';
import { useEffect, useState } from 'react';
import type { ProjectMetadata } from '@/types/api';
import type { TechNavigatorProfile } from '@/types/techNavigator';

interface Props {
  metadata: ProjectMetadata;
  projectId: string;
}

const PROJECT_TYPE_LABEL: Record<number, string> = {
  1: 'P1',
  2: 'P2',
  3: 'P3',
};

function ragDot(rag: string | null | undefined) {
  if (!rag) return null;
  const colorMap: Record<string, string> = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  const cls = colorMap[rag.toLowerCase()] ?? 'bg-slate-400';
  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full',
        cls,
      )}
      title={`RAG: ${rag}`}
    />
  );
}

export function ProjectHeaderTile({ metadata, projectId }: Props) {
  const { data: pipelineState } = usePipelineState(projectId);
  const [techNav, setTechNav] = useState<TechNavigatorProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    techNavigatorApi
      .get(projectId)
      .then((p) => {
        if (!cancelled) setTechNav(p);
      })
      .catch(() => {
        if (!cancelled) setTechNav(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const tshirt = techNav?.tshirt_size ?? null;
  const projectType = techNav?.project_type ?? null;

  return (
    <ActionCard title="Project">
      <div className="flex flex-col gap-3 mt-2 min-w-0">
        {/* Name + RAG */}
        <div className="flex items-start gap-2 min-w-0">
          {ragDot(metadata.rag)}
          <h2
            className="text-base font-semibold text-foreground leading-tight truncate"
            title={metadata.name}
          >
            {metadata.name}
          </h2>
        </div>

        {/* Hierarchy */}
        {metadata.hierarchy_path && metadata.hierarchy_path.length > 0 ? (
          <p
            className="text-xs text-muted-foreground truncate"
            title={metadata.hierarchy_path.map((s) => s.entity_name).join(' › ')}
          >
            {metadata.hierarchy_path.map((s) => s.entity_name).join(' › ')}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground truncate">
            {metadata.lob}
          </p>
        )}

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {pipelineState?.pipeline_stage ? (
            <PipelineStageBadge stage={pipelineState.pipeline_stage} />
          ) : metadata.pipeline_stage ? (
            <PipelineStageBadge stage={metadata.pipeline_stage} />
          ) : null}
          <DoIBadge
            doi={pipelineState?.doi}
            frozenDoi={pipelineState?.frozen_doi}
          />
          {projectType && (
            <Badge variant="outline" className="text-[10px]">
              {PROJECT_TYPE_LABEL[projectType] ?? `Type ${projectType}`}
            </Badge>
          )}
          {metadata.rag && (
            <Badge
              className={cn('text-[10px] capitalize', ragBgColor(metadata.rag))}
            >
              {metadata.rag}
            </Badge>
          )}
          {tshirt && (
            <Badge
              variant="outline"
              className="text-[10px] font-mono uppercase"
              title="Budget t-shirt size"
            >
              {tshirt}
            </Badge>
          )}
        </div>

        {metadata.pl_name && (
          <p className="text-xs text-muted-foreground mt-auto">
            PL · {metadata.pl_name}
          </p>
        )}
      </div>
    </ActionCard>
  );
}
