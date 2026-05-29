import { Calendar, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  userName: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  controller: 'Controller',
  cost_center_owner: 'Cost Center Owner',
  project_lead: 'Project Lead',
  executive: 'Executive',
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getFirstName(fullName: string): string {
  // Skip honorific prefixes (Dr., Prof., Mr., Mrs., Ms.) so a persona like
  // "Dr. Klaus Weber" greets as "Klaus" rather than "Dr.".
  const parts = fullName.split(' ').filter(Boolean);
  const HONORIFICS = new Set(['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.', 'Dr', 'Prof', 'Mr', 'Mrs', 'Ms']);
  const firstNonHonorific = parts.find((p) => !HONORIFICS.has(p));
  return firstNonHonorific || fullName;
}

/**
 * Derives the current forecast cycle label from the demo "today" date,
 * mirroring `backend/services/forecast_cycle.derive_cycle_label`.
 *
 * The demo runs at April 2026 by convention (see CLAUDE.md). We read the
 * actual current date and bucket it into a fiscal quarter so the badge
 * stays accurate whichever date the demo is running on.
 */
function getCurrentCycleLabel(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1–12
  const year = now.getFullYear();
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `Q${quarter} ${year} Cycle`;
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * v5 E7 [E-06d-j] Zone 1 — Launchpad header.
 *
 * Three rows of content:
 *   1. App title — "VIPER" in all-caps as primary, "Prototype" as subtitle [VIPER §12.2]
 *   2. Greeting + first name + role badge
 *   3. Status row: current date + active forecast cycle badge
 */
export function LaunchpadHeader({ userName, role }: Props) {
  const cycleLabel = getCurrentCycleLabel();
  const dateLabel = getFormattedDate();

  return (
    <div className="text-center py-6">
      {/* App title */}
      <div className="mb-3">
        <div className="text-4xl font-bold tracking-widest text-foreground">
          VIPER
        </div>
        <div className="text-sm font-medium text-muted-foreground tracking-wide mt-0.5">
          Prototype
        </div>
      </div>

      {/* Greeting */}
      <p className="text-xl text-foreground mb-2">
        {getGreeting()}, {getFirstName(userName)}
      </p>

      {/* Role badge */}
      <Badge variant="secondary" className="text-xs font-medium">
        {ROLE_LABELS[role] || role}
      </Badge>

      {/* Status row: date + cycle */}
      <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {dateLabel}
        </span>
        <span className="text-muted-foreground/30">•</span>
        <Badge
          variant="outline"
          className="text-xs font-medium border-primary/30 text-primary bg-primary/5 dark:bg-primary/10 inline-flex items-center gap-1.5"
        >
          <RefreshCcw className="h-3 w-3" />
          {cycleLabel}
        </Badge>
      </div>
    </div>
  );
}
