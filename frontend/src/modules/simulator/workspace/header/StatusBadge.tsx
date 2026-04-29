/**
 * v5 B2 — Workspace status badge (private / published / archived /
 * tier3-only). Mirrors the manager-table badge but with bigger type
 * for the workspace header.
 */

import { Archive, Eye, Globe, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  status: string;
  visibility: string | null;
  archived: boolean;
}

export function StatusBadge({ status, visibility, archived }: Props) {
  if (archived) {
    return (
      <Badge className="bg-muted text-muted-foreground hover:bg-muted">
        <Archive className="h-3 w-3 mr-1" aria-hidden="true" />
        Archived
      </Badge>
    );
  }
  if (status === 'private') {
    return (
      <Badge className="bg-muted text-muted-foreground hover:bg-muted">
        <Lock className="h-3 w-3 mr-1" aria-hidden="true" />
        Private
      </Badge>
    );
  }
  if (visibility === 'tier3_only') {
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">
        <Eye className="h-3 w-3 mr-1" aria-hidden="true" />
        Tier 3 only
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
      <Globe className="h-3 w-3 mr-1" aria-hidden="true" />
      Published
    </Badge>
  );
}
