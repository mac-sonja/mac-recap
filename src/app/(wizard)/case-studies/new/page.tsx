import { redirect } from "next/navigation";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import { wizardHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import { authorize } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import * as material from "@/modules/material";
import { currentYear } from "@/shared/i18n/format";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { CaseDetailsStep } from "../../_components/case-details-step";
import { MaterialStep } from "../../_components/material-step";
import { WizardFooter, WizardFrame } from "../../_components/wizard-frame";

/** The step 3 placeholder line; it is also the reason the inactive Avanti gives. */
const STEP_NOTE_ID = "wizard-step-note";

export interface NewCaseStudyPageProps {
  searchParams: Promise<{ caseId?: string | string[]; step?: string | string[]; clientId?: string | string[] }>;
}

/**
 * The new-case-study wizard (Story 2.5; steps renumbered by Story 2.17:
 * 1 Dettagli · 2 Materiale · 3 Genera). Owner/designer only (`create case`).
 * Without `?caseId=` it shows step 1 Dettagli for a new case, with the client
 * picker (Story 2.12): it authorizes `list clients` (denied → the actor's landing)
 * and loads every client; a failed load throws into the error boundary. `?clientId=`
 * preselects that client when it is one of the loaded clients (Story 2.13); an
 * unknown, malformed or repeated one is ignored. With `?caseId=` it loads that case
 * server-side; an unknown, malformed or deleted id (`NOT_FOUND`) or a case that is
 * no longer a draft goes back to Case studies, and any other lookup failure throws
 * into the error boundary. The details are complete once the case has a business
 * line (cases created before 2.17 have none); its material is checked once. With
 * no `step` (or an unknown one) the wizard opens the first incomplete step:
 * Dettagli without a business line, else Materiale without a file, else Genera.
 * `step=2` needs the business line and `step=3` a file too; otherwise they redirect
 * to the first step they lack. Materiale and Genera are stepper links on the same terms.
 */
export default async function NewCaseStudyPage({ searchParams }: NewCaseStudyPageProps) {
  const shell = await requireSurface("create case");
  if (shell === null) return null;

  const { caseId, step, clientId } = await searchParams;
  if (caseId === undefined) {
    if (!authorize(shell.actor, "list clients").ok) redirect(shell.landing);
    const clients = await caseStudy.listClients();
    if (!clients.ok) throw new Error(`Clients could not be listed: ${clients.error.code}`);
    // Only a single id that is in the list preselects; anything else leaves the picker empty.
    const initialClientId =
      typeof clientId === "string" && clients.value.some((client) => client.id === clientId) ? clientId : undefined;
    return (
      <WizardFrame caseStudy={null} current={1}>
        <CaseDetailsStep
          caseStudy={null}
          clients={clients.value}
          initialClientId={initialClientId}
          defaultYear={currentYear()}
          yearMin={caseStudy.YEAR_MIN}
          yearMax={caseStudy.YEAR_MAX}
          businessLines={caseStudy.BUSINESS_LINES}
          initialDetails={{ context: "", solution: "", results: "" }}
          maxChars={material.MAX_FORM_FIELD_CHARS}
        />
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
  const { id, code, name, status, year, locale, businessLine, client } = found.value;
  const wizardCase = { id, code, name, status };

  // The opening step, the gates on steps 2 and 3, and the stepper links.
  // A failed material check counts as no material.
  const detailsComplete = businessLine !== null;
  const has = await material.hasMaterial(id);
  const hasMaterial = has.ok && has.value;
  const firstIncomplete = !detailsComplete ? 1 : !hasMaterial ? 2 : 3;
  const reachable = (target: 1 | 2 | 3) => target === 1 || (target === 2 ? detailsComplete : detailsComplete && hasMaterial);
  const requested = step === "1" ? 1 : step === "2" ? 2 : step === "3" ? 3 : null;
  if (requested === null) redirect(wizardHref(id, firstIncomplete));
  if (!reachable(requested)) redirect(wizardHref(id, firstIncomplete));

  if (requested === 1) {
    const form = await material.getDetailsForm({ caseId: id });
    if (!form.ok) throw new Error(`Details could not be loaded: ${form.error.code}`);
    return (
      <WizardFrame caseStudy={wizardCase} current={1} reachable={reachable}>
        <CaseDetailsStep
          key={id}
          caseStudy={{ id, code, name, year, locale, businessLine, client }}
          clients={[]}
          defaultYear={year}
          yearMin={caseStudy.YEAR_MIN}
          yearMax={caseStudy.YEAR_MAX}
          businessLines={caseStudy.BUSINESS_LINES}
          initialDetails={form.value}
          maxChars={material.MAX_FORM_FIELD_CHARS}
        />
      </WizardFrame>
    );
  }

  if (requested === 3) {
    return (
      <WizardFrame caseStudy={wizardCase} current={3} reachable={reachable}>
        <h2 className="font-heading text-xl font-medium text-foreground-strong">{it.wizard.steps.generate}</h2>
        <p id={STEP_NOTE_ID} className="mt-1.5 font-body text-sm text-foreground-muted">
          {it.wizard.generatePlaceholder}
        </p>
        {/* Step 3 content arrives with Epic 3. */}
        <WizardFooter
          current={3}
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
    <WizardFrame caseStudy={wizardCase} current={2} reachable={reachable}>
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
