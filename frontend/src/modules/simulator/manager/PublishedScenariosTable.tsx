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
  /**
   * Simulator S4 — when the viewer is a Project Lead, published scenarios
   * they see are the leadership→PL handoff slices (§9.1): retitle the
   * section and badge each row "Handoff from <author>". Non-PL roles see
   * the standard published list (oversight channel, §9.2).
   */
  handoffMode?: boolean;
}

export function PublishedScenariosTable({
  scenarios,
  currentUserName,
  onOpen,
  onClone,
  handoffMode = false,
}: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        {handoffMode ? 'Handoffs from Leadership' : 'Published Scenarios'}
      </h3>
      {handoffMode && scenarios.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Published scenarios that touch your projects. You see only the
          slice for your own project(s) and can take it forward via Apply to
          Forecast.
        </p>
      )}
      {scenarios.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">
          {handoffMode ? 'No handoffs for your projects.' : 'No published scenarios.'}
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
                isHandoff={handoffMode}
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
