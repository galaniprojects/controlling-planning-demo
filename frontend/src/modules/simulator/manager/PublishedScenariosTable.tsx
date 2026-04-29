/**
 * v5 B2 — "Published Scenarios" table (read-only for non-authors,
 * clone-only actions enabled). Tier-3 visibility is enforced server-side.
 */

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ScenarioListItem } from '@/types/api';
import { ScenarioRow } from './ScenarioRow';

interface Props {
  scenarios: ScenarioListItem[];
  currentUserName: string;
  onOpen: (id: number) => void;
  onClone: (id: number) => void;
}

export function PublishedScenariosTable({
  scenarios,
  currentUserName,
  onOpen,
  onClone,
}: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        Published Scenarios
      </h3>
      {scenarios.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">
          No published scenarios.
        </p>
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
                showOwnerActions={false}
                onOpen={onOpen}
                onClone={onClone}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
