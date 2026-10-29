import { redirect } from "next/navigation";
import { DeleteCaseButton } from "@/app/(tool)/case-studies/_components/delete-case-button";
import { wizardHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import { authorize, can } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import * as jobs from "@/modules/jobs";
import * as material from "@/modules/material";
import { currentYear } from "@/shared/i18n/format";
import { CaseDetailsStep } from "../../_components/case-details-step";
import { GenerateStep } from "../../_components/generate-step";
import { GeneratingScreen } from "../../_components/generating-screen";
import { MaterialStep } from "../../_components/material-step";
import { NewCaseDialog } from "../../_components/new-case-dialog";
import { WizardFrame } from "../../_components/wizard-frame";

export interface NewCaseStudyPageProps {
  searchParams: Promise<{ caseId?: string | string[]; step?: string | string[]; clientId?: string | string[] }>;
}

/**
 * The new-case-study wizard (Story 2.5; steps reordered material first, owner
 * 2026-10-21: 1 Materiale · 2 Dettagli · 3 Genera). Owner/designer only (`create case`).
 * Without `?caseId=` it shows the new-case dialog over the wizard, which asks for the
 * client only (Story 2.12's picker): it authorizes `list clients` (denied → the
 * actor's landing) and loads every client; a failed load throws into the error
 * boundary. `?clientId=` preselects that client when it is one of the loaded clients
 * (Story 2.13); an unknown, malformed or repeated one is ignored. The dialog creates
 * the draft (title *Nome progetto*, no business line) and opens Materiale.
 * With `?caseId=` it loads that case server-side; an unknown, malformed or deleted id
 * (`NOT_FOUND`) or a case that is no longer a draft goes back to Case studies, and
 * any other lookup failure throws into the error boundary. The details are complete
 * once the case has at least one business line (Servizi); its material is checked once. With no `step`
 * (or an unknown one) the wizard opens the first incomplete step: Materiale without a
 * file, else Dettagli without a business line, else Genera. Materiale and Dettagli are
 * always open; `step=3` needs both, otherwise it redirects to the first step it lacks.
 * A `generating` case shows the waiting screen instead (Story 3.7b; it refreshes itself, so
 * the page then follows these rules). Step 3 shows the file and detail counts and **Genera**,
 * or **Riprova** with the failure when the newest `generate` job of the draft failed.
 * On every step of an existing draft the top bar offers **Elimina bozza** to a role that
 * may `delete case` (owner, 2026-10-22); after the delete the browser goes to Case studies.
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
        <NewCaseDialog clients={clients.value} initialClientId={initialClientId} year={currentYear()} />
      </WizardFrame>
    );
  }

  // A repeated `caseId` is malformed: `get` rejects a non-string as NOT_FOUND.
  const found = await caseStudy.get(typeof caseId === "string" ? caseId : null);
  if (!found.ok) {
    if (found.error.code === "NOT_FOUND") redirect("/case-studies");
    throw new Error(`Case study could not be loaded: ${found.error.code}`);
  }
  const { id, code, name, status, year, locale, businessLines, client } = found.value;
  const wizardCase = { id, code, name, status, clientName: client.name };
  // A generating case waits here; the screen refreshes itself until the case leaves `generating`.
  if (status === "generating") {
    return (
      <WizardFrame caseStudy={wizardCase} current={3}>
        <GeneratingScreen />
      </WizardFrame>
    );
  }
  // The wizard edits drafts otherwise only; any other status goes back to Case studies.
  if (status !== "draft") redirect("/case-studies");
  // **Elimina bozza** bottom left of every step, opposite Avanti (owner, 2026-10-22), for a role that may delete drafts.
  const deleteDraft = can(shell.actor, "delete case", { status: "draft" }) ? (
    <DeleteCaseButton caseId={id} name={name} status="draft" variant="bar" />
  ) : undefined;

  // The opening step, the gate on step 3, and the stepper links.
  // A failed material check counts as no material.
  const detailsComplete = businessLines.length > 0;
  const has = await material.hasMaterial(id);
  const hasMaterial = has.ok && has.value;
  const firstIncomplete = !hasMaterial ? 1 : !detailsComplete ? 2 : 3;
  const reachable = (target: 1 | 2 | 3) => target !== 3 || (detailsComplete && hasMaterial);
  const requested = step === "1" ? 1 : step === "2" ? 2 : step === "3" ? 3 : null;
  if (requested === null) redirect(wizardHref(id, firstIncomplete));
  if (!reachable(requested)) redirect(wizardHref(id, firstIncomplete));

  if (requested === 2) {
    const form = await material.getDetailsForm({ caseId: id });
    if (!form.ok) throw new Error(`Details could not be loaded: ${form.error.code}`);
    // The client can change while the case is a draft (owner, 2026-10-21): offer every client.
    // Without `list clients` (or when the list fails) the field offers the case's own client only.
    const listed = authorize(shell.actor, "list clients").ok ? await caseStudy.listClients() : null;
    const clients = listed?.ok ? listed.value : [];
    return (
      <WizardFrame caseStudy={wizardCase} current={2} reachable={reachable} footerLead={deleteDraft}>
        <CaseDetailsStep
          key={id}
          caseStudy={{ id, code, name, year, locale, businessLines, client }}
          clients={clients}
          defaultYear={year}
          yearMin={caseStudy.YEAR_MIN}
          yearMax={caseStudy.YEAR_MAX}
          businessLines={caseStudy.BUSINESS_LINES}
          initialDetails={form.value}
          maxChars={material.MAX_FORM_FIELD_CHARS}
          storyLimits={{
            resultLabelMax: caseStudy.CLIENT_RESULT_LABEL_MAX,
            resultValueMax: caseStudy.CLIENT_RESULT_VALUE_MAX,
            testimonialQuoteMax: caseStudy.CLIENT_TESTIMONIAL_QUOTE_MAX,
            testimonialAuthorMax: caseStudy.CLIENT_TESTIMONIAL_AUTHOR_MAX,
          }}
        />
      </WizardFrame>
    );
  }

  if (requested === 3) {
    const [files, form, listed] = await Promise.all([
      material.listAssets({ caseId: id }),
      material.getDetailsForm({ caseId: id }),
      jobs.getJobsFor(id),
    ]);
    if (!files.ok) throw new Error(`Material could not be loaded: ${files.error.code}`);
    if (!form.ok) throw new Error(`Details could not be loaded: ${form.error.code}`);
    // The newest generate job (newest first); a lookup error shows no failure.
    const lastRun = listed.ok ? listed.value.find((job) => job.kind === "generate") : undefined;
    const filled = material.FORM_FIELDS.filter((field) => form.value[field].trim() !== "").length;
    return (
      <WizardFrame caseStudy={wizardCase} current={3} reachable={reachable} footerLead={deleteDraft}>
        <GenerateStep
          key={id}
          caseId={id}
          fileCount={files.value.length}
          filled={filled}
          total={material.FORM_FIELDS.length}
          failed={lastRun?.status === "failed"}
        />
      </WizardFrame>
    );
  }

  const assets = await material.listAssets({ caseId: id });
  if (!assets.ok) throw new Error(`Material could not be loaded: ${assets.error.code}`);

  return (
    <WizardFrame caseStudy={wizardCase} current={1} reachable={reachable} footerLead={deleteDraft}>
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
