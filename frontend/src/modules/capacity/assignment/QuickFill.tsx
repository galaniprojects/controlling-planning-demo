/**
 * QuickFill — v5.2 W4 Track A (Session 6a).
 *
 * Sits at the top of each RoleSection.  Allows the CC Owner to pick a
 * person from a dropdown and fill ALL currently-unassigned months in
 * this role section with that person in one click.
 *
 * Already-assigned months are NOT overwritten.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2 "Quick fill row"
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { PersonCandidate } from './PersonPicker';
import type { MonthPersonAssignment } from './AssignmentStateContext';

interface QuickFillProps {
  months: string[];                              // all months in this section
  assignedMap: Map<string, MonthPersonAssignment[]>;  // month → persons currently set
  requestedHours: number;                        // default hours per month
  candidates: PersonCandidate[];
  onFill: (personId: string, personName: string, hours: number, months: string[]) => void;
}

export function QuickFill({
  months,
  assignedMap,
  requestedHours,
  candidates,
  onFill,
}: QuickFillProps) {
  const [selected, setSelected] = useState<PersonCandidate | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const unassignedMonths = months.filter(
    (m) => !assignedMap.has(m) || (assignedMap.get(m)?.length ?? 0) === 0,
  );
  const canFill = selected !== null && unassignedMonths.length > 0;

  const filtered = search.trim()
    ? candidates.filter((c) =>
        c.personName.toLowerCase().includes(search.toLowerCase()),
      )
    : candidates;

  const matching = filtered.filter((c) => c.matchesRole);
  const others = filtered.filter((c) => !c.matchesRole);

  const handleFill = () => {
    if (!selected || unassignedMonths.length === 0) return;
    onFill(selected.personId, selected.personName, requestedHours, unassignedMonths);
    setSelected(null);
  };

  return (
    <div className="flex items-center gap-2 rounded-sm bg-muted/40 px-2 py-1.5">
      <span className="text-[10px] font-medium text-muted-foreground shrink-0">
        Quick fill:
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-6 flex-1 items-center justify-between rounded border border-border bg-card px-2 text-xs hover:bg-accent min-w-0"
          >
            <span className={selected ? 'text-foreground truncate' : 'text-muted-foreground'}>
              {selected ? selected.personName : 'Select person…'}
            </span>
            <ChevronDown className="ml-1 h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start" side="bottom">
          <div className="border-b border-border px-2 py-1.5">
            <input
              autoFocus
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {matching.length > 0 && (
              <>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Matching role
                </p>
                {matching.map((c) => (
                  <button
                    key={c.personId}
                    type="button"
                    onClick={() => { setSelected(c); setOpen(false); setSearch(''); }}
                    className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <span className="text-foreground">{c.personName}</span>
                    <span className="text-muted-foreground">{Math.round(c.currentUtilPct)}%</span>
                  </button>
                ))}
              </>
            )}
            {others.length > 0 && (
              <>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Other roles
                </p>
                {others.map((c) => (
                  <button
                    key={c.personId}
                    type="button"
                    onClick={() => { setSelected(c); setOpen(false); setSearch(''); }}
                    className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <span className="text-foreground">{c.personName}</span>
                    <span className="text-muted-foreground">{Math.round(c.currentUtilPct)}%</span>
                  </button>
                ))}
              </>
            )}
            {filtered.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">No candidates found.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        size="sm"
        className="h-6 px-3 text-xs shrink-0"
        disabled={!canFill}
        onClick={handleFill}
      >
        Fill
      </Button>

      {unassignedMonths.length > 0 && (
        <span className="text-[10px] text-muted-foreground shrink-0">
          ({unassignedMonths.length} open)
        </span>
      )}
    </div>
  );
}
