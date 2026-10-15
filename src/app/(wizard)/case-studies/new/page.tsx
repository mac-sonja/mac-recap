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
import { DetailsStep } from "../../_components/details-step";
import { MaterialStep } from "../../_components/material-step";
import { NameStep } from "../../_components/name-step";
import { WizardFooter, WizardFrame } from "../../_components/wizard-frame";

/** The step 3 placeholder line; it is also the reason the inactive Avanti gives. */
const STEP_NOTE_ID = "wizard-step-note";

export interface NewCaseStudyPageProps {
  searchParams: Promise<{ caseId?: string | string[]; step?: string | string[]; clientId?: string | string[] }>;
}

/**
 * The new-case-study wizard (Story 2.5). Owner/designer only (`create case`).
 * Without `?caseId=` it shows step 0, the name form, with the client picker
 * (Story 2.12): it authorizes `list clients` (denied → the actor's landing) and
 * loads every client; a failed load throws into the error boundary. On step 0 only,
 * `?clientId=` preselects that client when it is one of the loaded clients (Story
 * 2.13); an unknown, malformed or repeated one is ignored. With `?caseId=` it loads that
 * case server-side; an unknown, malformed or deleted id
 * (`NOT_FOUND`) or a case that is no longer a draft goes back to Case studies, and any other lookup failure throws into
 * the error boundary. The case's material is checked once: with no `step` (or an
 * unknown one) the wizard opens the first incomplete step, Dettagli
 * (`redirect(&step=2)`) when the case has at least one file, else Materiale.
 * `step=1` is the Material step (Story 2.7). `step=2` (the Details step, Story
 * 2.10, with the saved form) and `step=3` (a placeholder until Epic 3) need
 * material; without it, or when the check fails, they redirect to `&step=1`.
 * Dettagli and Genera are stepper links only while the case has material.
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
      <WizardFrame caseStudy={null} current={0}>
        <NameStep
          clients={clients.value}
          initialClientId={initialClientId}
          defaultYear={currentYear()}
          yearMin={caseStudy.YEAR_MIN}
          yearMax={caseStudy.YEAR_MAX}
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
  const { id, code, name, status } = found.value;
  const wizardCase = { id, code, name, status };

  // One material check decides the opening step, the gate on steps 2 and 3, and the stepper links.
  // A failed check counts as no material: the case opens at step 1.
  const has = await material.hasMaterial(id);
  const hasMaterial = has.ok && has.value;
  const requested = step === "1" ? 1 : step === "2" ? 2 : step === "3" ? 3 : null;
  if (requested === null && hasMaterial) redirect(wizardHref(id, 2));
  if ((requested === 2 || requested === 3) && !hasMaterial) redirect(wizardHref(id, 1));

  if (requested === 2) {
    const form = await material.getDetailsForm({ caseId: id });
    if (!form.ok) throw new Error(`Details could not be loaded: ${form.error.code}`);
    return (
      <WizardFrame caseStudy={wizardCase} current={2} reachable={hasMaterial}>
        <DetailsStep caseId={id} initial={form.value} maxChars={material.MAX_FORM_FIELD_CHARS} />
      </WizardFrame>
    );
  }

  if (requested === 3) {
    return (
      <WizardFrame caseStudy={wizardCase} current={3} reachable={hasMaterial}>
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
    <WizardFrame caseStudy={wizardCase} current={1} reachable={hasMaterial}>
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
