# 00 — System

Three orientation walks every new operator runs first: switch personas, toggle the theme, reset the seeded database. None of these change project state — they prep your environment to walk the rest of the catalogue.

The four demo personas (used everywhere downstream) are:

| Persona ID (header) | Display name | Title | Localstorage key |
|---|---|---|---|
| `p-meier` | Anna Meier | IT Controller | `persona-controller` |
| `p-brenner` | Thomas Brenner | Head of Application Development (Cost Centre Owner) | `persona-cc-owner` |
| `p-sharma` | Priya Sharma | Senior Project Lead | `persona-pl` |
| `p-weber` | Dr. Klaus Weber | VP IT Strategy & Governance (Executive) | `persona-exec` |

The header column is the value sent on the `X-Current-User` header to the backend; the localstorage key is what the frontend `RoleContext` reads to bootstrap the session.

---

## W00.1: Persona switching

**Purpose**: Switch the active demo persona to view the app from another role's perspective.
**When to use**: Demo dress-rehearsal opener; any time you need to validate role-gated visibility (e.g., PL sees only own projects, Executive is read-only).
**Personas involved**: All — switching is itself the action.
**Pre-conditions**: App loaded at any route. Default starts as Anna Meier (Controller).
**Estimated walk-time**: 1 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | Locate the persona button in the top-right of the TopBar (shows the current name + caret) | Button label reads the current persona's display name (e.g., "Anna Meier") | Button has `aria-haspopup="menu"` and the visible caret icon |
| 2 | Any | Click the persona button | Dropdown menu opens listing all four personas with display name + title on each row | Menu items: "Anna Meier / IT Controller", "Thomas Brenner / Head of Application Development", "Priya Sharma / Senior Project Lead", "Dr. Klaus Weber / VP IT Strategy & Governance" |
| 3 | Any | Click any other persona row (e.g., **Priya Sharma · Senior Project Lead**) | Menu closes; page contents re-render with the new persona's data within ~500ms | TopBar button now reads "Priya Sharma"; greeting band updates to "Good evening, Priya"; role-aware tile counts shift (e.g., 7 KPI tiles for PL vs 9 for Controller) |
| 4 | Any | Hard-refresh the browser (Cmd-R) | Page reloads but stays on the chosen persona | TopBar button still reads the chosen persona's name (read from localstorage `creta-persona`) |

### Alternative paths

- **URL stays the same**: Persona switching is a state change, not a navigation. If you're on `/workbench?project=proj-mdh-rollout` and switch personas, you stay on that URL, but role gating may change what's visible (e.g., a PL who doesn't own that project will see an empty workspace or be redirected to their default module).
- **Default module per role**: Each persona has a `default_module` (controller=portfolio, pl=workbench, cc-owner=capacity, exec=portfolio). The Launchpad is the canonical landing page for all four; default modules only matter when the backend resolves an unknown route.

### Post-conditions

- Browser localstorage `creta-persona` updated to the chosen persona ID (`persona-controller` / `persona-cc-owner` / `persona-pl` / `persona-exec`).
- Subsequent API calls send `X-Current-User: <persona-id>` resolving to the chosen `DemoPersona`.

### Cross-references

- **Backend endpoint**: `routers/admin.py::list_roles()` (`GET /api/roles`)
- **Frontend**: `frontend/src/contexts/RoleContext.tsx`
- **In-app manual**: `launchpad.json § Role Switcher`
- **FAQ overlap**: faq.json `faq-11` ("How do I switch between personas in the demo?")

### Known issues / caveats

- The persona dropdown is the **only** way to switch personas in the UI. There is no per-action persona impersonation; demo presenters typically narrate the switch ("switching to Priya, the project lead…") so the audience tracks role changes.

---

## W00.2: Dark mode toggle

**Purpose**: Toggle the application theme between light and dark.
**When to use**: Audience preference, screenshare contrast, low-light demos. The theme persists across sessions, so set it once.
**Personas involved**: All — theme is per-browser, not per-persona.
**Pre-conditions**: App loaded.
**Estimated walk-time**: 1 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | Locate the sun / moon icon button immediately left of the persona switcher in the TopBar | Tooltip reads "Switch to light mode" when currently in dark, or "Switch to dark mode" when currently in light | Button `title` attribute matches the current state's opposite |
| 2 | Any | Click the icon | Theme flips immediately. Background and text colours update across all surfaces (charts, dialogs, grids) without a page reload | `<html class="dark">` for dark mode; `<html class="">` (no `dark` class) for light mode |
| 3 | Any | Reload the page (Cmd-R) | Theme persists | Localstorage `theme` key reads `dark` or `light` |
| 4 | Any | (Optional) Set theme via DevTools console: `localStorage.setItem('theme','system')` and reload | Theme follows the OS preference (light by default unless OS dark mode is active) | `<html>` class reflects OS state; toggle button shows the matching icon |

### Alternative paths

- **System theme**: A third "system" mode exists; it can be set via the dropdown in some persona's settings or programmatically as in step 4. The visible TopBar icon only cycles light↔dark in v5 (system mode is a hidden/legacy state).

### Post-conditions

- Localstorage `theme` key updated.
- `<html>` element receives the `dark` class for dark mode (or the class is absent for light).

### Cross-references

- **Frontend**: `frontend/src/contexts/ThemeContext.tsx`
- **In-app manual**: `launchpad.json § Dark Mode Toggle`
- **FAQ overlap**: faq.json `faq-20` ("How do I enable dark mode?")

### Known issues / caveats

- Some chart SVGs render with hardcoded colors in legacy code paths and may look slightly off under dark mode. Per CLAUDE.md the canonical pattern is to use CSS custom properties (`var(--chart-grid)`); if you spot a chart with stark white labels in dark mode, file it as a visual-consistency follow-up.

---

## W00.3: Reset demo data

**Purpose**: Restore the seeded database to a clean baseline after destructive testing (approving CRs, advancing pipeline stages, mutating BTC profiles, etc.).
**When to use**: Between demo dress rehearsals; after testing a destructive workflow; whenever PROGRESS.md or this catalogue references seed counts you want to reproduce exactly.
**Personas involved**: Controller (Anna). The reset is gated to `controller` role.
**Pre-conditions**: Backend running on `http://localhost:8000`. Currently logged in as Controller.
**Estimated walk-time**: 2 min (≤ 1 min if no surfaces need a hard refresh afterwards).

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/admin` | Administration module loads with the master-data CRUD layout | Page heading "Administration"; left rail starts with "1 · MASTER DATA" group |
| 2 | Controller | Locate the **Reset Demo** button in the page header (top-right, next to **Guide**) | Button visible and enabled | Button label reads "Reset Demo" |
| 3 | Controller | Click **Reset Demo** | Confirmation dialog appears: "Reset demo data? This will discard all changes since the last seed and re-load the demo dataset." | Modal heading visible |
| 4 | Controller | Click **Confirm** | Backend re-runs the seed pipeline; UI shows a loading state for ~3-5 seconds; toast "Demo data reset" appears on completion | POST to `/api/admin/reset-demo` returns 200; demo state reloaded |
| 5 | Controller | Reload the browser (Cmd-R) | Some surfaces (Workbench grids, Capacity heatmaps) require a hard refresh to drop cached client state | After reload, KPI counters match the canonical seed: 11 active projects, 4 pending CRs (#9 / #15 / #19 / #27), 3 pending intakes |

### Alternative paths

- **Headless reset**: Skip the UI entirely with `curl -X POST http://localhost:8000/api/admin/reset-demo`. Useful for QA harness scripts or test setup hooks.
- **Backend restart**: Stopping and restarting `python main.py` does NOT reset the database — `creta_demo.db` persists. Only the explicit reset endpoint or deleting the SQLite file forces a re-seed.

### Post-conditions

- `creta_demo.db` reloaded from `backend/seed/seed.sql` + JSON fixtures (`backend/seed/fixtures/`).
- All in-flight CRs, scenario actions, BTC overlays, scheduled changes, and audit log entries are wiped.
- Demo state matches the README's documented baseline: 4 personas, 11 projects + 6 offerings + 17 internal services, 4 pending CRs, 39 distribution edges, 27 BTC profiles, 1 published scenario + 2 draft.

### Cross-references

- **Backend endpoint**: `routers/admin.py::reset_demo()` (`POST /api/admin/reset-demo`)
- **Decision tag**: none (system utility)
- **Note in catalogue index**: see [`README.md § Demo prep checklist`](./README.md#demo-prep-checklist)

### Known issues / caveats

- The reset is **destructive** and irreversible from the UI. Anyone connected to the same backend (e.g., a co-presenter on a shared dev server) will lose their state too.
- After a reset, the dev server's Python process retains some module-level caches (e.g., the rollup cache). If a downstream surface looks stale (Charging Rollup map, AI Report Builder), restart the backend process.
- The role of the requester is NOT enforced in v5 — any persona currently active in the UI can hit the endpoint. (The button is shown only to controllers, but the API itself is open. This is a v5 demo concession; in production the endpoint would require `controller` role.)

---

## Cross-workflow notes

- All three system flows are **idempotent**: switching personas back and forth, toggling theme repeatedly, or resetting the demo twice in a row produce no extra side effects.
- Persona switching does NOT clear notification badges — the backend resolves notifications per `X-Current-User`, so the new persona's notifications appear immediately on switch.
- A reset DOES clear all dynamic state: in-flight scenarios, edited forecasts, mutated BTC overlays, custom report views, etc. Demo presenters typically reset between runs to avoid cumulative drift.
