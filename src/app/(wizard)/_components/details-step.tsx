"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { saveDetailsField } from "@/app/(tool)/case-studies/actions";
import { PRIMARY_ACTION } from "@/app/_components/button-styles";
import { wizardHref } from "@/app/_lib/routes";
import type { DetailsForm, FormField } from "@/modules/material";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { DEBOUNCE_MS, useAutosaveFields } from "./use-autosave-fields";
import { WizardFooter } from "./wizard-frame";

const copy = it.wizard.details;

export { DEBOUNCE_MS };

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
  /** Sends one field; true when saved. Default: the case's `saveDetailsField`. */
  save?: (field: FormField, text: string) => Promise<boolean>;
  /** Where **Avanti** goes once every field is saved. Default: the case wizard's step 3. */
  nextHref?: string;
}

const codePoints = (text: string) => [...text].length;
const isFilled = (text: string) => text.trim() !== "";

/**
 * Step 2, Details (EXPERIENCE.md step 2, Story 2.10): three optional textareas,
 * *Contesto*, *Soluzione* and *Risultati*, with their prompts as placeholders.
 * Each field saves through `saveDetailsField` after {@link DEBOUNCE_MS} of idle
 * time and on blur, only when its text changed (`useAutosaveFields`). One save per field runs at a time;
 * text typed meanwhile is saved after it. A failed save keeps the text, shows an
 * inline error (announced politely) and retries on the next edit or blur. Text over
 * `maxChars` code points is never sent. **Avanti** is always active (NFR6) and,
 * like any link clicked while the step is open (stepper, back arrow), first flushes
 * pending saves; it stays on the step when a field could not be saved.
 */
export function DetailsStep({ caseId, initial, maxChars, save, nextHref }: DetailsStepProps) {
  const router = useRouter();
  const baseId = useId();
  const [announcements, setAnnouncements] = useState<ReadonlyArray<{ id: number; text: string }>>([]);
  const [leaving, setLeaving] = useState(false);
  // Guards double activation synchronously; `leaving` only drives aria-busy.
  const leavingRef = useRef(false);
  const nextAnnouncement = useRef(0);
  const textareas = useRef<Partial<Record<FormField, HTMLTextAreaElement | null>>>({});
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  const tooLong = (text: string) => codePoints(text) > maxChars;
  const limitMessage = fill(copy.errors.tooLong, { max: maxChars.toLocaleString("it-IT") });

  function announce(text: string) {
    const line = { id: nextAnnouncement.current++, text };
    setAnnouncements((current) => [...current, line].slice(-ANNOUNCEMENTS_KEPT));
  }

  const form = useAutosaveFields<FormField>({
    fields: FIELDS,
    initial,
    save: save ?? (async (field, text) => (await saveDetailsField({ caseId, field, text })).ok),
    tooLong,
    onSaveFailed: (field) => announce(fill(copy.announceError, { field: copy.labels[field], message: copy.errors.saveFailed })),
    onUnsavedLink: (href) => void leave(href),
  });
  const { values, failed } = form;

  /** Leaves the step once its fields are saved; otherwise stays and focuses the first unsaved field. */
  async function leave(href: string) {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    const ok = await form.flushAll();
    if (unmounted.current) return;
    if (ok) {
      router.push(href);
      return;
    }
    leavingRef.current = false;
    setLeaving(false);
    const unsaved = form.firstUnsaved();
    if (unsaved !== undefined) textareas.current[unsaved]?.focus();
  }

  const filled = FIELDS.filter((field) => isFilled(values[field])).length;

  return (
    <div>
      <h2 className="font-heading text-xl font-medium text-foreground-strong mb-6">{copy.heading}</h2>

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
                onChange={(event) => form.change(field, event.target.value)}
                onBlur={() => void form.save(field)}
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
            onClick={() => void leave(nextHref ?? wizardHref(caseId, 3))}
            className={cn(PRIMARY_ACTION, "px-[18px] py-2.5")}
          >
            {it.wizard.next}
          </button>
        }
      />
    </div>
  );
}
