/**
 * v5 B2 — WorkspaceSidebar host.
 *
 * Section bodies (`ProjectsSection`, `BacklogSection`,
 * `PortfolioSettingsSection`, `ResourcesSection`, `BulkActionsSection`)
 * are owned by T2 and T4. This host wires them together and lets the
 * workspace pass slot children when sections aren't yet implemented
 * (so T1 can ship a working shell before T2/T4 land).
 */

import type { ReactNode } from 'react';
import {
  ChevronDown,
  Folder,
  Layers,
  Settings2,
  Users,
  Wand2,
} from 'lucide-react';
import { useScenarioContext } from '../../useScenarioContext';
import { useTier3 } from '../../permissions/useTier3';

interface SectionProps {
  title: string;
  icon: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  hidden?: boolean;
}

function SidebarSection({
  title,
  icon,
  children,
  defaultOpen = true,
  hidden = false,
}: SectionProps) {
  if (hidden) return null;
  return (
    <details
      open={defaultOpen}
      className="border-b border-border last:border-b-0"
    >
      <summary className="cursor-pointer list-none px-3 py-2 hover:bg-accent/50 flex items-center gap-2 text-sm font-medium text-foreground select-none">
        <ChevronDown
          className="h-3 w-3 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
        {icon}
        {title}
      </summary>
      <div className="px-3 pb-3">
        {children ?? (
          <p className="text-xs text-muted-foreground italic py-2">
            Section pending — populated by surface team.
          </p>
        )}
      </div>
    </details>
  );
}

interface Props {
  /** T2 fills these via section components mounted as children. */
  projectsSection?: ReactNode;
  backlogSection?: ReactNode;
  portfolioSettingsSection?: ReactNode;
  /** T4 fills these. ResourcesSection is hidden when !tier3. */
  resourcesSection?: ReactNode;
  bulkActionsSection?: ReactNode;
}

export function WorkspaceSidebar({
  projectsSection,
  backlogSection,
  portfolioSettingsSection,
  resourcesSection,
  bulkActionsSection,
}: Props) {
  const ctx = useScenarioContext();
  const hasTier3 = useTier3({
    impactTier3Visible: ctx.impact?.tier3_visible ?? null,
  });

  return (
    <aside className="w-64 flex-shrink-0 border border-border rounded-lg bg-card">
      <SidebarSection
        title="Projects"
        icon={<Folder className="h-3.5 w-3.5 text-muted-foreground" />}
      >
        {projectsSection}
      </SidebarSection>
      <SidebarSection
        title="Backlog"
        icon={<Layers className="h-3.5 w-3.5 text-muted-foreground" />}
        defaultOpen={false}
      >
        {backlogSection}
      </SidebarSection>
      <SidebarSection
        title="Portfolio Settings"
        icon={<Settings2 className="h-3.5 w-3.5 text-muted-foreground" />}
        defaultOpen={false}
      >
        {portfolioSettingsSection}
      </SidebarSection>
      {/* Tier 3 — hidden DOM when caller lacks the flag, per redaction rule. */}
      <SidebarSection
        title="Resources"
        icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
        defaultOpen={false}
        hidden={!hasTier3}
      >
        {resourcesSection}
      </SidebarSection>
      <SidebarSection
        title="Bulk Actions"
        icon={<Wand2 className="h-3.5 w-3.5 text-muted-foreground" />}
        defaultOpen={false}
      >
        {bulkActionsSection}
      </SidebarSection>
    </aside>
  );
}
