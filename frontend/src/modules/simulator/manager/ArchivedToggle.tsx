/**
 * v5 B2 — "Show archived" toggle for the Scenario Manager.
 */

import { Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  showArchived: boolean;
  onToggle: (next: boolean) => void;
}

export function ArchivedToggle({ showArchived, onToggle }: Props) {
  const Icon = showArchived ? ArchiveRestore : Archive;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onToggle(!showArchived)}
      aria-pressed={showArchived}
    >
      <Icon className="h-4 w-4 mr-1.5" />
      {showArchived ? 'Hide archived' : 'Show archived'}
    </Button>
  );
}
