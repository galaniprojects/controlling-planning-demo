/**
 * v5.1 W6 [C-01] — Lucide icon mapping for the Launchpad module-card grid.
 *
 * Single source of truth so the card grid component stays free of icon
 * lookup logic. Module IDs match `backend/routers/global_launchpad.py::MODULES`
 * and `frontend/src/lib/routes.ts::MODULE_ROUTES`.
 */
import {
  BarChart3,
  BookOpen,
  Briefcase,
  LayoutDashboard,
  ListChecks,
  Network,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

export const MODULE_CARD_ICONS: Record<string, LucideIcon> = {
  portfolio: LayoutDashboard,
  backlog: ListChecks,
  workbench: Briefcase,
  capacity: Users,
  simulator: Sparkles,
  charging: Network,
  reporting: BarChart3,
  admin: Settings,
  documentation: BookOpen,
};
