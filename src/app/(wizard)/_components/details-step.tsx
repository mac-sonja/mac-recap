"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { saveDetailsField } from "@/app/(tool)/case-studies/actions";
import { PRIMARY_ACTION } from "@/app/_components/button-styles";
import { wizardHref } from "@/app/_lib/routes";
import type { DetailsForm, FormField } from "@/modules/material";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { WizardFooter } from "./wizard-frame";

const copy = it.wizard.details;

/** Idle time after the last keystroke before a field saves. */
export const DEBOUNCE_MS = 800;

/** The fields in `FORM_FIELDS` order (the material module's index is server-only). */
const FIELDS = ["context", "solution", "results"] as const satisfies readonly FormField[];

/** How many live-region lines stay mounted. */
const ANNOUNCEMENTS_KEPT = 5;

export interface DetailsStepProps {
  caseId: string;
  /** The saved form from `getDetailsForm`; `""` for a field never saved. */
  initial: DetailsForm;
  /** `MAX_FORM_FIELD_CHARS`, counted in code points like the server. */
  maxChars: number;
}

/** One field's save bookkeeping, outside React state so overlapping saves see it at once. */
interface FieldSave {
  timer: ReturnType<typeof setTimeout> | null;
  /** The save loop running for this field, if any. */
  inFlight: Promise<void> | null;
  /** Set when a save is asked for while one is in flight: the loop saves the latest text once more. */
  again: boolean;
  /** The text the server holds. */
  saved: string;
}

const codePoints = (text: string) => [...text].length;
const isFilled = (text: string) => text.trim() !== "";

/**
 * Step 2, Details (EXPERIENCE.md step 2, Story 2.10): three optional textareas,
 * *Contesto*, *Soluzione* and *Risultati*, with their prompts as placeholders.
 * Each field saves through `saveDetailsField` after {@link DEBOUNCE_MS} of idle
 * time and on blur, only when its text changed. One save per field runs at a time;
 * text typed meanwhile is saved after it. A failed save keeps the text, shows an
 * inline error (announced politely) and retries on the next edit or blur. Text over
 * `maxChars` code points is never sent. **Avanti** is always active (NFR6) and,
 * like any link clicked while the step is open (stepper, back arrow), first flushes
 * pending saves; it stays on the step when a field could not be saved.
 */
export function DetailsStep({ caseId, initial, maxChars }: DetailsStepProps) {
  const router = useRouter();
  const baseId = useId();
  const [values, setValues] = useState<DetailsForm>(() => ({ ...initial }));
  const [failed, setFailed] = useState<ReadonlySet<FormField>>(() => new Set());
  const [announcements, setAnnouncements] = useState<ReadonlyArray<{ id: number; text: string }>>([]);
  const [leaving, setLeaving] = useState(false);
  // Guards double activation synchronously; `leaving` only drives aria-busy.
  const leavingRef = useRef(false);

  const valuesRef = useRef(values);
  const saves = useRef<Record<FormField, FieldSave>>(
    Object.fromEntries(FIELDS.map((field) => [field, { timer: null, inFlight: null, again: false, saved: initial[field] }])) as Record<
      FormField,
      FieldSave
    >,
  );
  const nextAnnouncement = useRef(0);
  const unmounted = useRef(false);
  const textareas = useRef<Partial<Record<FormField, HTMLTextAreaElement | null>>>({});

  const tooLong = (text: string) => codePoints(text) > maxChars;
  const limitMessage = fill(copy.errors.tooLong, { max: maxChars.toLocaleString("it-IT") });

  function markFailed(field: FormField, on: boolean) {
    if (unmounted.current) return;
    setFailed((current) => {
      if (current.has(field) === on) return current;
      const next = new Set(current);
      if (on) next.add(field);
      else next.delete(field);
      return next;
    });
  }

  function announce(text: string) {
    if (unmounted.current) return;
    const line = { id: nextAnnouncement.current++, text };
    setAnnouncements((current) => [...current, line].slice(-ANNOUNCEMENTS_KEPT));
  }

  function clearTimer(field: FormField) {
    const state = saves.current[field];
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
  }

  /** Saves the field's latest text now (pending debounce flushed); resolves when the field is settled. */
  function save(field: FormField): Promise<void> {
    clearTimer(field);
    const state = saves.current[field];
    if (state.inFlight !== null) {
      state.again = true;
      return state.inFlight;
    }
    const first = valuesRef.current[field];
    if (first === state.saved) markFailed(field, false);
    if (tooLong(first) || first === state.saved) return Promise.resolve();

    state.inFlight = (async () => {
      try {
        do {
          state.again = false;
          const text = valuesRef.current[field];
          if (text === state.saved) markFailed(field, false);
          if (tooLong(text) || text === state.saved) break;
          let ok: boolean;
          try {
            ok = (await saveDetailsField({ caseId, field, text })).ok;
          } catch {
            ok = false;
          }
          if (ok) {
            state.saved = text;
            markFailed(field, false);
          } else {
            markFailed(field, true);
            announce(fill(copy.announceError, { field: copy.labels[field], message: copy.errors.saveFailed }));
          }
        } while (state.again);
      } finally {
        state.inFlight = null;
      }
    })();
    return state.inFlight;
  }

  /** Flushes every field; true when the server now holds every field's text. */
  async function flushAll(): Promise<boolean> {
    await Promise.all(FIELDS.map(save));
    return FIELDS.every((field) => saves.current[field].saved === valuesRef.current[field]);
  }

  const settled = () =>
    FIELDS.every((field) => {
      const state = saves.current[field];
      return state.timer === null && state.inFlight === null && state.saved === valuesRef.current[field];
    });

  /** Leaves the step once its fields are saved; otherwise stays and focuses the first unsaved field. */
  async function leave(href: string) {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    const ok = await flushAll();
    if (unmounted.current) return;
    if (ok) {
      router.push(href);
      return;
    }
    leavingRef.current = false;
    setLeaving(false);
    const unsaved = FIELDS.find((field) => saves.current[field].saved !== valuesRef.current[field]);
    if (unsaved !== undefined) textareas.current[unsaved]?.focus();
  }

  // The latest `leave` for the document listener below, which is bound once.
  const leaveRef = useRef(leave);
  const settledRef = useRef(settled);
  const flushRef = useRef(flushAll);
  const tooLongRef = useRef(tooLong);
  useEffect(() => {
    tooLongRef.current = tooLong;
    leaveRef.current = leave;
    settledRef.current = settled;
    flushRef.current = flushAll;
  });

  useEffect(() => {
    unmounted.current = false;
    const fieldSaves = saves.current;

    // A same-origin link clicked with unsaved text (stepper, back arrow) waits for the flush.
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target !== "" && anchor.target !== "_self")) return;
      if (anchor.origin !== window.location.origin || anchor.hasAttribute("download")) return;
      if (settledRef.current()) return;
      event.preventDefault();
      event.stopPropagation();
      void leaveRef.current(`${anchor.pathname}${anchor.search}${anchor.hash}`);
    }
    // Reload or tab close: best effort, the request may not finish.
    const onBeforeUnload = () => void flushRef.current();

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      unmounted.current = true;
      // Leaving another way: a pending debounce, or a field still unsaved (a failed save), saves now.
      const unsaved = (field: FormField) => {
        const text = valuesRef.current[field];
        return fieldSaves[field].saved !== text && !tooLongRef.current(text);
      };
      if (FIELDS.some((field) => fieldSaves[field].timer !== null || unsaved(field))) void flushRef.current();
    };
  }, []);

  function change(field: FormField, text: string) {
    valuesRef.current = { ...valuesRef.current, [field]: text };
    setValues(valuesRef.current);
    clearTimer(field);
    if (tooLong(text)) return;
    saves.current[field].timer = setTimeout(() => void save(field), DEBOUNCE_MS);
  }

  const filled = FIELDS.filter((field) => isFilled(values[field])).length;

  return (
    <div>
      <h2 className="font-heading text-xl font-medium text-foreground-strong">{copy.heading}</h2>
      <p className="mt-1.5 mb-6 font-body text-sm text-foreground-muted">{copy.intro}</p>

      <div className="flex flex-col gap-5">
        {FIELDS.map((field) => {
          const id = `${baseId}-${field}`;
          const errorId = `${id}-error`;
          const text = values[field];
          const over = tooLong(text);
          const atLimit = codePoints(text) >= maxChars;
          const message = over ? limitMessage : failed.has(field) ? copy.errors.saveFailed : atLimit ? limitMessage : null;
          return (
            <div key={field} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="font-label text-xs text-foreground-muted">
                {copy.labels[field]}
              </label>
              <textarea
                id={id}
                ref={(element) => {
                  textareas.current[field] = element;
                }}
                name={field}
                value={text}
                placeholder={copy.placeholders[field]}
                aria-invalid={over || failed.has(field) || undefined}
                aria-describedby={message === null ? undefined : errorId}
                onChange={(event) => change(field, event.target.value)}
                onBlur={() => void save(field)}
                className="min-h-[120px] w-full resize-y rounded-md border border-transparent bg-surface-control p-3 font-body text-sm text-foreground placeholder:text-foreground-muted"
              />
              {message !== null && (
                <p id={errorId} className={cn("font-label text-xs", over || failed.has(field) ? "text-danger" : "text-foreground-muted")}>
                  {message}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div role="status" aria-live="polite" aria-relevant="additions" className="sr-only">
        {announcements.map((line) => (
          <p key={line.id}>{line.text}</p>
        ))}
      </div>

      <WizardFooter
        current={2}
        start={<span className="font-mono">{fill(copy.counter, { n: filled })}</span>}
        action={
          <button
            type="button"
            aria-busy={leaving || undefined}
            onClick={() => void leave(wizardHref(caseId, 3))}
            className={cn(PRIMARY_ACTION, "px-[18px] py-2.5")}
          >
            {it.wizard.next}
          </button>
        }
      />
    </div>
  );
}
