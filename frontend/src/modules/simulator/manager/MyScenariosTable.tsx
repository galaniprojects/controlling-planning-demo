/**
 * v5 B2 — "My Scenarios" table (owner-only actions enabled).
 */

import { FlaskConical } from 'lucide-react';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import type { ScenarioListItem } from '@/types/api';
import { ScenarioRow } from './ScenarioRow';

interface Props {
  scenarios: ScenarioListItem[];
  currentUserName: string;
  onOpen: (id: number) => void;
  onClone: (id: number) => void;
  onPublish: (id: number) => void;
  onUnpublish: (id: number) => void;
  onArchive: (id: number, archived: boolean) => void;
  onDelete: (id: number) => void;
  onRebase: (id: number) => void;
}

export function MyScenariosTable({
  scenarios,
  currentUserName,
  onOpen,
  onClone,
  onPublish,
  onUnpublish,
  onArchive,
  onDelete,
  onRebase,
}: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">My Scenarios</h3>
      {scenarios.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          size="sm"
          title="No scenarios yet"
          description='Click "Create New Scenario" to get started.'
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Author</TableHead>
              <TableHead className="text-xs">Modified</TableHead>
              <TableHead className="text-xs">Headline Impact</TableHead>
              <TableHead className="text-xs w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {scenarios.map((s) => (
              <ScenarioRow
                key={s.id}
                scenario={s}
                isAuthor={s.author_name === currentUserName}
                showOwnerActions
                onOpen={onOpen}
                onClone={onClone}
                onPublish={onPublish}
                onUnpublish={onUnpublish}
                onArchive={onArchive}
                onDelete={onDelete}
                onRebase={onRebase}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
