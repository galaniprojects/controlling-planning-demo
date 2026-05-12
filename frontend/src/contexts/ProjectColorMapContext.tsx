/**
 * ProjectColorMap — stable project-id → color mapping for the Capacity
 * timeline and its sibling surfaces.
 *
 * Spec ref: guides/Capacity_Module_Redesign_Spec.md §3.2.
 *
 * Lifecycle:
 *   - The map is built once per "data-ready" event from the visible-projects
 *     set. Subsequent renders read from the same map so segments don't
 *     swap colors on re-render.
 *   - When the visible set grows (e.g., a previously-filtered project
 *     becomes visible), the new project is appended to the map at its
 *     ordinal position, keeping existing assignments stable.
 *   - When scope changes, the consuming component calls
 *     `registerVisibleProjects(nextIds)` again; previously-mapped
 *     project ids retain their color.
 *
 * Used by:
 *   - Track A timeline rows (PersonTimelineRow, RoleGroup aggregate bar)
 *   - Track C side panel (PersonDetail allocation dots)
 *   - W4 S6a assignment panel (ghost segments)
 *   - Demand strip / chart legends (Track B & W4 S7)
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { assignProjectColor } from '@/lib/projectColors';

interface ProjectColorMapState {
  /** Pure lookup — returns the stable color for a project, or a neutral gray fallback. */
  getColor: (projectId: string) => string;
  /**
   * Register the set of currently-visible project ids. Existing entries
   * keep their color; new ids get appended at the next palette index.
   * Safe to call on every data fetch; cheap when the set is unchanged.
   */
  registerVisibleProjects: (projectIds: readonly string[]) => void;
  /**
   * Reset the color map. Use sparingly — only when scope semantics
   * fundamentally change (e.g., switching workspace ↔ availability view).
   */
  reset: () => void;
}

const FALLBACK_COLOR = '#9ca3af'; // gray-400 — semantic "unmapped"
const ProjectColorMapCtx = createContext<ProjectColorMapState | null>(null);

export function ProjectColorMapProvider({ children }: { children: ReactNode }) {
  // Map: project_id → palette index (so order in `assignProjectColor` is stable).
  const indexRef = useRef<Map<string, number>>(new Map());
  // Bumped after each registration so consumers re-render with the new map.
  const [version, setVersion] = useState(0);

  const registerVisibleProjects = useCallback(
    (projectIds: readonly string[]) => {
      const map = indexRef.current;
      let mutated = false;
      for (const pid of projectIds) {
        if (!map.has(pid)) {
          map.set(pid, map.size);
          mutated = true;
        }
      }
      if (mutated) setVersion((v) => v + 1);
    },
    [],
  );

  const reset = useCallback(() => {
    indexRef.current = new Map();
    setVersion((v) => v + 1);
  }, []);

  const getColor = useCallback(
    (projectId: string): string => {
      const idx = indexRef.current.get(projectId);
      if (idx === undefined) return FALLBACK_COLOR;
      return assignProjectColor(idx);
    },
    // The version dep keeps memoization correct across registrations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const value = useMemo<ProjectColorMapState>(
    () => ({ getColor, registerVisibleProjects, reset }),
    [getColor, registerVisibleProjects, reset],
  );

  return (
    <ProjectColorMapCtx.Provider value={value}>
      {children}
    </ProjectColorMapCtx.Provider>
  );
}

export function useProjectColorMap(): ProjectColorMapState {
  const ctx = useContext(ProjectColorMapCtx);
  if (!ctx) {
    throw new Error(
      'useProjectColorMap must be used inside <ProjectColorMapProvider>',
    );
  }
  return ctx;
}

/** Convenience hook — returns the color for a single project id. */
export function useProjectColor(projectId: string): string {
  return useProjectColorMap().getColor(projectId);
}
