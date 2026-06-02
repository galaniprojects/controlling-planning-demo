"""Project-scope recompute core (What-If Simulator redesign, spec §4–§6).

This package replaces the aggregate-budget project-scope path of the legacy
``scenario_engine`` with a clean core built around the two-layer storage model:

  - Layer 1 — macros as ordered transforms (``ScenarioAction`` rows).
  - Layer 2 — hand edits as a sparse overlay (the ``Scenario*Edit`` /
    ``ScenarioMixChange`` tables in ``models.scenarios``).

Resolution order (spec §5.1): anchor → apply macros in order → overlay hand
edits on top, hand-edits-win, absolute-month keying (§5.2). The resolved cell
grid rolls up into the same per-project state shape the existing engine emits,
so the impact dashboard stays insulated (§6).

Module map (one Session-1 workstream owns each):
  - types.py       — frozen interface dataclasses (the seam between streams).
  - resolution.py  — anchor → macros → overlay → ResolvedGrid (Stream A).
  - macros.py      — the four curve transforms (Stream A).
  - rollup.py      — ResolvedGrid → per-project state + splits (Stream B).
  - routing.py     — direct overlay-diff routing + the two write paths (Stream C).

Portfolio scope, lever-12 (cost-allocation sandbox), the promote routing
vocabulary, and the impact dashboard are reused untouched.
"""
