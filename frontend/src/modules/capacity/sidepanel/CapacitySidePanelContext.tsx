/**
 * CapacitySidePanelContext — v5.2 W3 Track C (Session 5a).
 *
 * Capacity-specific dispatcher built on top of the shared
 * `SidePanelContext` (W2). Adds:
 *
 *   - A typed `mode` enum (`person | cell | project_summary | assignment`)
 *     so any caller (timeline rows, demand strip, hotspot list, project
 *     group rows, inbox) can request a panel open without prop-drilling.
 *   - A width-per-mode policy that maps to the shared panel's `width`
 *     option:
 *
 *         person          → 280  (spec §7.1)
 *         cell            → 280  (spec §7.1)
 *         project_summary → 280  (spec §10.8)
 *         assignment      → 400  (spec §9.2)
 *
 *   - A handler-registration seam for the two modes whose content this
 *     wave does not own:
 *
 *         project_summary → registered by Track A (Wave 4, Session 9)
 *         assignment      → registered by Track A (Wave 4, Session 6a)
 *
 *     Calling `openProjectSummary` / `openAssignment` before the owning
 *     track has registered its handler is a no-op (with a console.warn)
 *     so the entry-point surface is wired today and content lights up
 *     when the dependent sessions land.
 *
 * Spec references:
 *   - guides/Capacity_Module_Redesign_Spec.md §7 (panel layout + person /
 *     cell content)
 *   - guides/Capacity_Module_Redesign_Implementation_Guide.md §S5a
 *
 * The shared `SidePanelContext` and `SidePanel` layout are intentionally
 * untouched — this provider is a wrapper, not a replacement.
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
import { useSidePanel } from '@/contexts/SidePanelContext';
import { CapacityPanelContent } from './CapacityPanelContent';
import { CAPACITY_PANEL_WIDTH } from './widths';

// ---------------------------------------------------------------------------
// Mode types
// ---------------------------------------------------------------------------

/** Discriminated union for the currently-active panel mode + payload. */
export type CapacityPanelMode =
  | { kind: 'person'; ccId: string; personId: string }
  | {
      kind: 'cell';
      dimensionId: string;
      pivot: string;
      month?: string;
      rowLabel: string;
    }
  | { kind: 'project_summary'; projectId: string }
  | {
      kind: 'assignment';
      projectId: string;
      ccId?: string;
      crId?: number;
    };

// ---------------------------------------------------------------------------
// Handler types — registered by downstream tracks
// ---------------------------------------------------------------------------

export type ProjectSummaryHandler = (projectId: string) => void;

export type AssignmentHandler = (
  projectId: string,
  opts?: { ccId?: string; crId?: number },
) => void;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface OpenPersonOptions {
  /** Optional title override; defaults to "Person detail". */
  title?: string;
}

interface OpenCellArgs {
  dimensionId: string;
  /** e.g., 'role' | 'cost_center' | 'location' | 'hierarchy'. */
  pivot: string;
  /** Optional month/quarter/year focus (e.g., '2026-09', 'Q3 2026'). */
  month?: string;
  /** Human-readable row label (e.g., 'MUC / App Development'). */
  rowLabel: string;
  /**
   * Optional title override; defaults to `${rowLabel} — ${month}` when
   * a month is provided, otherwise just `rowLabel`.
   */
  title?: string;
}

interface CapacitySidePanelState {
  /** Current panel mode (`null` when the panel is closed). */
  mode: CapacityPanelMode | null;
  /** Open the standard person detail (§7.2). */
  openPerson: (
    ccId: string,
    personId: string,
    opts?: OpenPersonOptions,
  ) => void;
  /** Open the org-level cell drill-down (§7.3). */
  openCell: (args: OpenCellArgs) => void;
  /**
   * Open the project-summary panel (§10.8). Stub — no-op with a
   * console.warn until Track A (W4 §10) registers its handler via
   * `registerProjectSummaryHandler`.
   */
  openProjectSummary: ProjectSummaryHandler;
  /**
   * Open the assignment panel (§9.2). Stub — no-op with a console.warn
   * until Track A (W4 §6a) registers its handler via
   * `registerAssignmentHandler`.
   */
  openAssignment: AssignmentHandler;
  /** Close the panel and clear the active mode. */
  closePanel: () => void;
  /**
   * Plug-in seam for the project-summary handler. Returns an
   * unregister function so the owner can clean up on unmount.
   */
  registerProjectSummaryHandler: (handler: ProjectSummaryHandler) => () => void;
  /**
   * Plug-in seam for the assignment handler. Returns an unregister
   * function so the owner can clean up on unmount.
   */
  registerAssignmentHandler: (handler: AssignmentHandler) => () => void;
}

const CapacitySidePanelCtx = createContext<CapacitySidePanelState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CapacitySidePanelProvider({ children }: { children: ReactNode }) {
  const { openPanel, closePanel: closeSharedPanel } = useSidePanel();
  const [mode, setMode] = useState<CapacityPanelMode | null>(null);

  // Handler refs survive across renders without forcing the open*
  // callbacks to depend on a state slice — keeps the dispatcher stable
  // for tracks that capture it once at mount time.
  const projectSummaryHandlerRef = useRef<ProjectSummaryHandler | null>(null);
  const assignmentHandlerRef = useRef<AssignmentHandler | null>(null);

  /**
   * The shared `SidePanel` captures the React node passed to
   * `openPanel(...)`. We pass a stable dispatcher node
   * (`<CapacityPanelContent />`) and let it re-read `mode` from this
   * context on each render — that way the same node renders different
   * content as the mode changes (Person → Cell → ...), keeping the
   * shared panel layout out of our way.
   */
  const dispatcherNode = <CapacityPanelContent />;

  const openPerson = useCallback(
    (ccId: string, personId: string, opts?: OpenPersonOptions) => {
      setMode({ kind: 'person', ccId, personId });
      openPanel(opts?.title ?? 'Person detail', dispatcherNode, {
        width: CAPACITY_PANEL_WIDTH.person,
      });
    },
    // dispatcherNode is created fresh per render but is referentially
    // equivalent for openPanel's purposes (stable component type).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openPanel],
  );

  const openCell = useCallback(
    (args: OpenCellArgs) => {
      setMode({
        kind: 'cell',
        dimensionId: args.dimensionId,
        pivot: args.pivot,
        month: args.month,
        rowLabel: args.rowLabel,
      });
      const defaultTitle = args.month
        ? `${args.rowLabel} — ${args.month}`
        : args.rowLabel;
      openPanel(args.title ?? defaultTitle, dispatcherNode, {
        width: CAPACITY_PANEL_WIDTH.cell,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openPanel],
  );

  const openProjectSummary = useCallback<ProjectSummaryHandler>((projectId) => {
    const handler = projectSummaryHandlerRef.current;
    if (handler) {
      handler(projectId);
      return;
    }
    console.warn(
      '[CapacitySidePanel] openProjectSummary called before a handler ' +
        'was registered. Project summary content lands in W4 (Session 9 — ' +
        'group-by-project view).',
      { projectId },
    );
  }, []);

  const openAssignment = useCallback<AssignmentHandler>((projectId, opts) => {
    const handler = assignmentHandlerRef.current;
    if (handler) {
      handler(projectId, opts);
      return;
    }
    console.warn(
      '[CapacitySidePanel] openAssignment called before a handler was ' +
        'registered. Assignment-panel content lands in W4 (Session 6a).',
      { projectId, ...opts },
    );
  }, []);

  const closePanel = useCallback(() => {
    setMode(null);
    closeSharedPanel();
  }, [closeSharedPanel]);

  const registerProjectSummaryHandler = useCallback(
    (handler: ProjectSummaryHandler) => {
      projectSummaryHandlerRef.current = handler;
      return () => {
        if (projectSummaryHandlerRef.current === handler) {
          projectSummaryHandlerRef.current = null;
        }
      };
    },
    [],
  );

  const registerAssignmentHandler = useCallback(
    (handler: AssignmentHandler) => {
      assignmentHandlerRef.current = handler;
      return () => {
        if (assignmentHandlerRef.current === handler) {
          assignmentHandlerRef.current = null;
        }
      };
    },
    [],
  );

  const value = useMemo<CapacitySidePanelState>(
    () => ({
      mode,
      openPerson,
      openCell,
      openProjectSummary,
      openAssignment,
      closePanel,
      registerProjectSummaryHandler,
      registerAssignmentHandler,
    }),
    [
      mode,
      openPerson,
      openCell,
      openProjectSummary,
      openAssignment,
      closePanel,
      registerProjectSummaryHandler,
      registerAssignmentHandler,
    ],
  );

  return (
    <CapacitySidePanelCtx.Provider value={value}>
      {children}
    </CapacitySidePanelCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCapacitySidePanel(): CapacitySidePanelState {
  const ctx = useContext(CapacitySidePanelCtx);
  if (!ctx) {
    throw new Error(
      'useCapacitySidePanel must be used inside <CapacitySidePanelProvider>',
    );
  }
  return ctx;
}
