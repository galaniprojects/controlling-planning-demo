/**
 * IdentityTab — first Define tab. Owns the project's "who/what/when"
 * fields:
 *   - name, description (single free-text summary covering
 *     problem/driver/outcome; backend keeps a single `description`
 *     column today and echoes the reserved alias slots as null)
 *   - project_type (P1/P2/P3) — also surfaced on the TN tab but
 *     editable here for the natural top-down flow
 *   - capex_opex
 *   - lob_id (Line of Business)
 *   - pl_person_id (Project Lead)
 *   - start_month / end_month
 *
 * Persistence is buffered via `useDirtyBuffer`. The footer Save button
 * flushes through `PUT /api/projects/{id}/identity`. On `/define/new`
 * Save instead calls `POST /api/projects/define` with the name only
 * and the parent shell routes the user to `/define/{newId}`.
 *
 * Inputs carry the `define-anchor-*` ids defined in
 * `DoIRequirementsRegistry` so the DoI overlay deep-links land on the
 * right field.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/shared/Skeleton';
import { useDirtyBuffer } from './useDirtyBuffer';
import { defineApi } from './api';
import { referenceApi } from '@/api/endpoints';
import type { LoBRef, RefPerson } from '@/types/api';
import type {
  CapexOpex,
  ProjectDefineResponse,
  ProjectIdentityUpdate,
} from '@/types/define';

/**
 * Working shape used inside the tab buffer. A superset of
 * `ProjectIdentityUpdate` with non-optional keys for cleaner form
 * binding. The Save call slices this down to the fields the backend
 * accepts.
 */
interface IdentityBuffer {
  name: string;
  description: string;
  project_type: number | null;
  capex_opex: CapexOpex;
  lob_id: string | null;
  pl_person_id: string | null;
  start_month: string;
  end_month: string | null;
}

interface Props {
  /** `null` when on `/define/new` (no DB row yet). */
  projectId: string | null;
  /** Currently-loaded project (canonical baseline) — null while loading or on /new. */
  initial: ProjectDefineResponse | null;
  /** Anchor id requested by the DoI overlay deep-link. */
  focusAnchor: string | null;
  /** Called after a successful Save. On /define/new, includes the new id. */
  onSaved: (response: ProjectDefineResponse) => void;
  /** Whether the persona can edit (controller / PL on own project). */
  readOnly: boolean;
  /** Whether the buffer is dirty (mirrored upward for tab pip). */
  onDirtyChange?: (dirty: boolean) => void;
}

const EMPTY_BUFFER: IdentityBuffer = {
  name: '',
  description: '',
  project_type: null,
  capex_opex: 'opex',
  lob_id: null,
  pl_person_id: null,
  start_month: '2026-04',
  end_month: null,
};

const PROJECT_TYPE_OPTIONS = [
  { value: 1, label: 'P1 — Business case' },
  { value: 2, label: 'P2 — Strategic' },
  { value: 3, label: 'P3 — Compliance / lifecycle' },
] as const;

function projectToBuffer(p: ProjectDefineResponse | null): IdentityBuffer {
  if (!p) return EMPTY_BUFFER;
  return {
    name: p.name ?? '',
    description: p.description ?? '',
    project_type: p.project_type ?? null,
    capex_opex: p.capex_opex ?? 'opex',
    lob_id: p.lob_id ?? null,
    pl_person_id: p.pl_person_id ?? null,
    start_month: p.start_month ?? '2026-04',
    end_month: p.end_month ?? null,
  };
}

function bufferToIdentityUpdate(b: IdentityBuffer): ProjectIdentityUpdate {
  return {
    name: b.name,
    description: b.description || null,
    project_type: b.project_type,
    capex_opex: b.capex_opex,
    lob_id: b.lob_id,
    pl_person_id: b.pl_person_id,
    start_month: b.start_month,
    end_month: b.end_month,
  };
}

export function IdentityTab({
  projectId,
  initial,
  focusAnchor,
  onSaved,
  readOnly,
  onDirtyChange,
}: Props) {
  // Memoise — `projectToBuffer` is referentially unstable otherwise
  // and would re-fire the `useDirtyBuffer` sync effect on every render.
  const baseline = useMemo(() => projectToBuffer(initial), [initial]);

  const buffer = useDirtyBuffer<IdentityBuffer>({
    initial: baseline,
    onSave: async (value) => {
      if (!projectId) {
        // /define/new path — name-only create. Other fields are
        // ignored on the create call; the canonical Define-page read
        // hydrates them after the redirect.
        const created = await defineApi.create({ name: value.name.trim() });
        onSaved(created);
        return projectToBuffer(created);
      }
      const updated = await defineApi.updateIdentity(
        projectId,
        bufferToIdentityUpdate(value),
      );
      onSaved(updated);
      return projectToBuffer(updated);
    },
  });

  // Bubble dirty state up to the parent (used for the tab pip).
  useEffect(() => {
    onDirtyChange?.(buffer.isDirty);
  }, [buffer.isDirty, onDirtyChange]);

  // Reference data — LoBs + PLs (load once).
  const [lobs, setLobs] = useState<LoBRef[]>([]);
  const [people, setPeople] = useState<RefPerson[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    Promise.all([referenceApi.getLobs(), referenceApi.getPeople()])
      .then(([l, p]) => {
        if (!alive) return;
        setLobs(l.items);
        setPeople(p.items.filter((person) => person.is_active));
      })
      .finally(() => {
        if (alive) setRefLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Focus + scroll the requested anchor (deep-link from DoI overlay).
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusAnchor || !containerRef.current) return;
    const el = containerRef.current.querySelector<HTMLElement>(
      `[id="${focusAnchor}"], [data-define-anchor="${focusAnchor}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Defer focus so the scroll completes first.
      window.setTimeout(() => {
        if (typeof el.focus === 'function') el.focus();
      }, 200);
    }
  }, [focusAnchor]);

  const v = buffer.value;
  const hasName = v.name.trim().length > 0;
  const canSave = hasName && buffer.isDirty && !buffer.saving && !readOnly;

  return (
    <div ref={containerRef} className="space-y-6">
      <section className="rounded-md border border-border bg-card p-4 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">Project identity</h2>
          <p className="text-xs text-muted-foreground">
            Name and description anchor the project; the rest can be filled
            iteratively as the DoI overlay points to gaps.
          </p>
        </header>

        <Field
          label="Project name"
          required
          anchor="define-anchor-name"
          rightHint={
            !projectId ? 'Required to create the project.' : undefined
          }
        >
          <Input
            id="define-anchor-name"
            data-define-anchor="define-anchor-name"
            value={v.name}
            onChange={(e) => buffer.patch({ name: e.target.value })}
            placeholder="Enter project name"
            disabled={readOnly}
          />
        </Field>

        <Field
          label="Problem statement / Business driver / Expected outcome"
          rightHint="Single free-text summary."
        >
          <Textarea
            value={v.description}
            onChange={(e) => buffer.patch({ description: e.target.value })}
            rows={4}
            placeholder="Briefly describe the problem, the business driver, and the expected outcome."
            disabled={readOnly}
          />
        </Field>
      </section>

      <section className="rounded-md border border-border bg-card p-4 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">
            Classification &amp; ownership
          </h2>
          <p className="text-xs text-muted-foreground">
            Required at DoI 1. P3 projects are pre-funded; P1/P2 compete in
            the ranked envelope.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Project type" anchor="define-anchor-project-type">
            {refLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select
                value={v.project_type ? String(v.project_type) : ''}
                onValueChange={(s) =>
                  buffer.patch({
                    project_type: (Number(s) as 1 | 2 | 3) || null,
                  })
                }
                disabled={readOnly}
              >
                <SelectTrigger
                  id="define-anchor-project-type"
                  data-define-anchor="define-anchor-project-type"
                >
                  <SelectValue placeholder="Select project type" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label="Line of business">
            {refLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select
                value={v.lob_id ?? ''}
                onValueChange={(s) => buffer.patch({ lob_id: s || null })}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select LoB" />
                </SelectTrigger>
                <SelectContent>
                  {lobs.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label="Project lead">
            {refLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select
                value={v.pl_person_id ?? ''}
                onValueChange={(s) => buffer.patch({ pl_person_id: s || null })}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project lead" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.role_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">Timeline</h2>
          <p className="text-xs text-muted-foreground">
            Start month is required; end month becomes mandatory at DoI 2.
          </p>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Start month">
            <Input
              type="month"
              value={v.start_month}
              onChange={(e) =>
                buffer.patch({ start_month: e.target.value || '2026-04' })
              }
              disabled={readOnly}
            />
          </Field>
          <Field label="End month">
            <Input
              type="month"
              value={v.end_month ?? ''}
              onChange={(e) =>
                buffer.patch({ end_month: e.target.value || null })
              }
              disabled={readOnly}
            />
          </Field>
        </div>
      </section>

      {/* Footer — Save row. */}
      <div className="sticky bottom-0 -mx-2 px-2 py-3 bg-background/95 backdrop-blur-sm border-t border-border flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground min-h-[1.25rem]">
          {buffer.saving ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Saving…
            </span>
          ) : buffer.error ? (
            <span className="text-destructive">{buffer.error}</span>
          ) : buffer.isDirty ? (
            <span>Unsaved changes on this tab.</span>
          ) : projectId ? (
            <span>All changes saved.</span>
          ) : (
            <span>Enter a name to enable Save.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!buffer.isDirty || buffer.saving}
            onClick={buffer.reset}
          >
            Discard
          </Button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={() => {
              void buffer.save().catch(() => {
                /* error already surfaced via buffer.error */
              });
            }}
          >
            {projectId ? 'Save identity' : 'Create project'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  required?: boolean;
  anchor?: string;
  rightHint?: string;
  children: ReactNode;
}

function Field({ label, required, anchor, rightHint, children }: FieldProps) {
  return (
    <div className="space-y-1.5" data-define-field-anchor={anchor}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={anchor}
          className="text-sm font-medium text-foreground"
        >
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden>
              {' *'}
            </span>
          ) : null}
        </label>
        {rightHint ? (
          <span className="text-xs text-muted-foreground">{rightHint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
