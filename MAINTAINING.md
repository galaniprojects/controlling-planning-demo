# Maintaining the marketing repo

This repository is a CPC-branded mirror of `bill-pap/vision-demo-prototype`. Three commits sit on top of upstream `main` to apply the marketing override: branding/seed (CPC values + supply-chain themes), Liquid Glass theme, and README/docs rebrand.

## Sync from prototype

```bash
git fetch upstream
git merge upstream/main
```

If upstream is fast-forward you're done. Otherwise resolve conflicts in the override files below, then commit.

## Expected conflict surface

These files are touched by every prototype release and will most often need conflict resolution:

**Branding (values-only swaps):**
- `backend/config.py` — `BRANDING` dict
- `frontend/src/config/branding.ts` — `BRANDING` const
- `frontend/index.html` — title + storage prefix + `liquid-glass` bootstrap
- `README.md`, `SETUP.md`, `docs/workflows/*.md`

**Seed data (carried-forward names):**
- `backend/seed/generate_seed_v5/config/master.py` — LOBS, PROGRAMMES (Manufacturing Systems / Supply Chain & Logistics / Enterprise Services / Digital & Innovation)
- `backend/seed/generate_seed_v5/config/people.py` — personas Sarah Mitchell / James Cooper / Anita Desai / Robert Chen + `user-{first-name}` IDs
- `backend/seed/generate_seed_v5/config/branding.py` — `FICTIONAL_CORP_ROOTS` (Apex …) + `FICTIONAL_DIVISIONS` (Manufacturing Operations / …)
- `backend/seed/generate_seed_v5/config/legal.py` — `_DIVISIONS`, `_LE_CORP_ROOTS`
- `backend/seed/generate_seed_v5/config/entities.py` — Smart Logistics Pilot, Supply Chain Compliance System
- `backend/seed/generate_seed_v5/config/milestones.py` — same project name updates
- `backend/seed/generate_seed_v5/config/scenarios.py` — persona name reference
- `backend/seed/generate_seed_v5/s05_people.py`, `s20_system.py` — docstring + audit-log refs
- `backend/seed/seed.sql` — **regenerated**, never hand-edit (see below)

**Theme:**
- `frontend/src/contexts/ThemeContext.tsx` — `applyTheme` adds `liquid-glass` class
- `frontend/src/index.css` — `@custom-variant glass` + `.liquid-glass` + `.liquid-glass.dark` blocks + body gradient + `.glass-surface` rule
- `frontend/src/components/layout/{TopBar,SidePanel}.tsx` + `frontend/src/components/ui/{card,dialog,sheet}.tsx` — `glass-surface` className additions

## Resolution strategy

- For **branding values** (BRANDING dicts, persona names, project names, LoB/programme names, corp-root/division names): always keep this side. The upstream may rename, restructure, or evolve fields — fold new fields/structure but keep CPC values.
- For **theme code**: keep this side's `.liquid-glass` blocks and `glass-surface` className additions. If upstream changes `--card`, `--background`, `--border`, or other theme tokens, fold those changes into both `:root`/`.dark` (upstream's path) AND the `.liquid-glass`/`.liquid-glass.dark` overrides.
- For **seed.sql**: do NOT resolve manually. After resolving the source files (above), regenerate:

  ```bash
  cd backend/seed
  ../.venv/bin/python -m generate_seed_v5.runner
  cd ..
  .venv/bin/python -m seed.generate_seed_v5.s21_v5_1_external_costs > /tmp/c09.sql
  cat /tmp/c09.sql >> seed/seed.sql
  ```

  Then `git add backend/seed/seed.sql` to mark the conflict resolved.

## Verification before push

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
cd frontend && npx vite build
```

If `git merge --abort` is needed, the local `pre-refork-snapshot` branch (if still present) and the patches at `~/Desktop/marketing-refork-patches/` capture the original override content for re-derivation.

## When upstream restructures a touched file

Pre-existing tsc errors in `frontend/src/modules/workbench/...` are inherited from upstream — not ours to fix. Run `npx vite build` (skips tsc) to verify the bundle, and run `pytest` for the backend.

If a touched seed file is renamed or removed in upstream, port the override to the new file shape — the `.patch` files at `~/Desktop/marketing-refork-patches/` document the original override values for reference.
