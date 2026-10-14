import { redirect } from "next/navigation";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import { wizardHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import * as caseStudy from "@/modules/case-study";
import * as material from "@/modules/material";
import { currentYear } from "@/shared/i18n/format";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { MaterialStep } from "../../_components/material-step";
import { NameStep } from "../../_components/name-step";
import { WizardFooter, WizardFrame } from "../../_components/wizard-frame";

/** The step 2 placeholder line; it is also the reason the inactive Avanti gives. */
const STEP_NOTE_ID = "wizard-step-note";

export interface NewCaseStudyPageProps {
  searchParams: Promise<{ caseId?: string | string[]; step?: string | string[] }>;
}

/**
 * The new-case-study wizard (Story 2.5). Owner/designer only (`create case`).
 * Without `?caseId=` it shows step 0, the name form. With `?caseId=` it loads that
 * case server-side and opens step 1; an unknown, malformed or deleted id
 * (`NOT_FOUND`) or a case that is no longer a draft goes back to Case studies, and any other lookup failure throws into
 * the error boundary. Step 1 is the Material step (Story 2.7): its files, limits
 * and allowlist are loaded here and passed down. `&step=2` opens the step 2
 * placeholder (until the Story 2.10 UI) only when the case has material; without
 * material (or when the check fails) it redirects to step 1's URL. Any other
 * `step` renders step 1.
 */
export default async function NewCaseStudyPage({ searchParams }: NewCaseStudyPageProps) {
  const shell = await requireSurface("create case");
  if (shell === null) return null;

  const { caseId, step } = await searchParams;
  if (caseId === undefined) {
    return (
      <WizardFrame caseStudy={null} current={0}>
        <NameStep defaultYear={currentYear()} yearMin={caseStudy.YEAR_MIN} yearMax={caseStudy.YEAR_MAX} />
      </WizardFrame>
    );
  }

  // A repeated `caseId` is malformed: `get` rejects a non-string as NOT_FOUND.
  const found = await caseStudy.get(typeof caseId === "string" ? caseId : null);
  if (!found.ok) {
    if (found.error.code === "NOT_FOUND") redirect("/case-studies");
    throw new Error(`Case study could not be loaded: ${found.error.code}`);
  }
  // The wizard edits drafts only; any other status goes back to Case studies.
  if (found.value.status !== "draft") redirect("/case-studies");
  const { id, name, status } = found.value;
  const wizardCase = { id, name, status };

  // Step 2 is reachable only with material; otherwise the URL goes back to step 1.
  if (step === "2") {
    const has = await material.hasMaterial(id);
    if (!has.ok || !has.value) redirect(wizardHref(id));
    return (
      <WizardFrame caseStudy={wizardCase} current={2}>
        <h2 className="font-heading text-xl font-medium text-foreground-strong">{it.wizard.steps.details}</h2>
        <p id={STEP_NOTE_ID} className="mt-1.5 font-body text-sm text-foreground-muted">
          {it.wizard.detailsPlaceholder}
        </p>
        {/* Step 2 content arrives with the Story 2.10 UI. */}
        <WizardFooter
          current={2}
          action={
            <button
              type="button"
              aria-disabled="true"
              aria-describedby={STEP_NOTE_ID}
              className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, "cursor-not-allowed px-[18px] py-2.5")}
            >
              {it.wizard.next}
            </button>
          }
        />
      </WizardFrame>
    );
  }

  const assets = await material.listAssets({ caseId: id });
  if (!assets.ok) throw new Error(`Material could not be loaded: ${assets.error.code}`);

  return (
    <WizardFrame caseStudy={wizardCase} current={1}>
      <MaterialStep
        caseId={id}
        initialAssets={assets.value}
        maxAssets={material.MAX_ASSETS_PER_CASE}
        maxFileBytes={material.MAX_FILE_BYTES}
        allowedContentTypes={material.ALLOWED_CONTENT_TYPES}
      />
    </WizardFrame>
  );
}
