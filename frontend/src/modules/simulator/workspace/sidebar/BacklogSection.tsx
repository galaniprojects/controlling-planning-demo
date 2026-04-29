/**
 * v5 B2 — BacklogSection: shortcuts to backlog-scoped surfaces.
 *
 * Two entries:
 *   - "Open backlog (sandbox)" — opens BacklogSandboxSurface.
 *   - "Inject hypothetical project" — opens HypotheticalProjectSurface.
 *
 * The backlog itself is a portfolio-scoped surface (no project id), so the
 * navigation URL omits the entityId segment.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { Layers, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BacklogSection() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const navigateToSurface = (key: string) =>
    navigate(`/simulator/scenarios/${params.id}/surface/${key}`);

  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start h-7 text-xs"
        onClick={() => navigateToSurface('backlog')}
      >
        <Layers className="h-3 w-3 mr-1.5 text-muted-foreground" />
        Open backlog (sandbox)
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start h-7 text-xs"
        onClick={() => navigateToSurface('hypothetical-project')}
      >
        <Plus className="h-3 w-3 mr-1.5 text-muted-foreground" />
        Inject hypothetical project
      </Button>
    </div>
  );
}
