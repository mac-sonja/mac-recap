"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { generateCaseStudy } from "@/app/(tool)/case-studies/actions";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import { STEP_HEADING } from "@/app/_components/field-styles";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { WizardFooter } from "./wizard-frame";

const copy = it.wizard.generate;

export interface GenerateStepProps {
  caseId: string;
  /** The case's non-deleted files. */
  fileCount: number;
  /** Contesto and Soluzione filled (Risultati and Testimonial are not counted). */
  filled: number;
  /** How many details the counter counts (2). */
  total: number;
  /** The newest generate job of this draft failed: say so and offer **Riprova**. */
  failed: boolean;
}

/**
 * Wizard step 3, Genera (Story 3.7b): what the case has, and **Genera** (**Riprova** after a
 * failed run), which runs `generateCaseStudy`. Without a file the button is inactive and its
 * reason is linked by `aria-describedby`; client info never enables it, and the action checks
 * everything again. On success the page is asked again and shows the waiting screen.
 */
export function GenerateStep({ caseId, fileCount, filled, total, failed }: GenerateStepProps) {
  const router = useRouter();
  const baseId = useId();
  const reasonId = `${baseId}-reason`;
  const failedId = `${baseId}-failed`;
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = fileCount > 0;

  async function run() {
    if (!ready || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await generateCaseStudy({ caseId });
      if (result.ok) {
        // Stay busy until the page shows the waiting screen.
        router.refresh();
        return;
      }
      setError(
        result.error.code === "NO_MATERIAL"
          ? copy.noMaterial
          : result.error.code === "STALE_STATUS" || result.error.code === "NOT_FOUND"
            ? it.wizard.errors.notDraft
            : copy.errors.generic,
      );
    } catch {
      setError(copy.errors.generic);
    }
    busy.current = false;
    setPending(false);
  }

  return (
    <div aria-busy={pending || undefined}>
      <h2 className={STEP_HEADING}>{it.wizard.steps.generate}</h2>
      <p className="mt-1.5 font-mono text-sm text-foreground-muted">{fill(copy.counter, { n: fileCount, m: filled, total })}</p>

      {failed && (
        <p id={failedId} className="mt-6 font-body text-sm text-danger">
          {copy.failed}
        </p>
      )}

      {/* Always mounted, so screen readers announce the error line when it appears. */}
      <div role="alert" className="mt-6 font-body text-sm text-danger empty:hidden">
        {error}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {pending ? copy.starting : null}
      </div>

      <WizardFooter
        start={ready ? undefined : <span id={reasonId}>{copy.noMaterial}</span>}
        action={
          <button
            type="button"
            onClick={() => void run()}
            aria-disabled={!ready || pending}
            aria-describedby={ready ? undefined : reasonId}
            aria-busy={pending || undefined}
            className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, !ready && "cursor-not-allowed", "h-10 px-5")}
          >
            {failed ? copy.retry : copy.action}
          </button>
        }
      />
    </div>
  );
}
