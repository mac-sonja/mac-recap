import { redirect } from "next/navigation";
import { clientHref, clientWizardHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import { clientLimits, clientMaterialLimits } from "@/app/(tool)/clients/_lib/client-limits";
import { authorize } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { WizardFrame } from "../../_components/wizard-frame";
import { ClientDetailsStep } from "./_components/client-details-step";
import { ClientMaterialStep } from "./_components/client-material-step";
import { CLIENT_WIZARD_STEPS, clientStepHref } from "./_components/client-steps";

export interface NewClientPageProps {
  searchParams: Promise<{ clientId?: string | string[]; step?: string | string[] }>;
}

/**
 * The client wizard (Story 2.15), owner/designer only (`manage clients`; any other
 * role goes to its landing). Without `?clientId=` it adds a client at step 1
 * Dettagli, and the back arrow goes to `/clients`. With one it edits that client
 * (**Modifica cliente**, or an unfinished client's row): an unknown, malformed or
 * repeated id goes back to `/clients`, any other lookup failure throws into the
 * error boundary, and the back arrow goes to the client's page. `step=2` opens
 * Materiale (Story 2.16, the client's current files) only once every required field
 * is filled; otherwise, and with no or an unknown `step`, step 1 opens. Step 3
 * Introduzione stays hidden (Story 4.11). Below 1024 px the frame is read-only.
 */
export default async function NewClientPage({ searchParams }: NewClientPageProps) {
  const shell = await requireSurface("manage clients");
  if (shell === null) return null;
  // Reading a client (its data and brief) is `list clients`.
  if (!authorize(shell.actor, "list clients").ok) redirect(shell.landing);

  const { clientId, step } = await searchParams;
  const limits = clientLimits();

  if (clientId === undefined) {
    return (
      <WizardFrame
        caseStudy={null}
        current={1}
        back={{ href: "/clients", label: it.clientWizard.backToClients }}
        eyebrow={it.clientWizard.eyebrow}
        header={null}
        steps={CLIENT_WIZARD_STEPS}
      >
        <ClientDetailsStep client={null} industries={caseStudy.CLIENT_INDUSTRIES} limits={limits} />
      </WizardFrame>
    );
  }

  // A repeated `clientId` is malformed: `getClient` rejects a non-string as CLIENT_NOT_FOUND.
  const found = await caseStudy.getClient(typeof clientId === "string" ? clientId : null);
  if (!found.ok) {
    if (found.error.code === "CLIENT_NOT_FOUND") redirect("/clients");
    throw new Error(`Client could not be loaded: ${found.error.code}`);
  }
  const client = found.value;
  const complete = caseStudy.isClientComplete(client, client.brief);
  if (step === "2" && !complete) redirect(clientWizardHref(client.id, 1));
  const current = step === "2" ? 2 : 1;
  // Step 2 lists the client's files (with signed thumbnails); a failed read throws into the error boundary.
  let assets: caseStudy.ListedClientAsset[] = [];
  if (current === 2) {
    const listed = await caseStudy.listClientMaterial({ clientId: client.id });
    if (!listed.ok) throw new Error(`Client material could not be loaded: ${listed.error.code}`);
    assets = listed.value;
  }

  const header = (
    <>
      <span className="min-w-0 truncate font-body text-sm text-foreground">{client.name}</span>
      <span className="shrink-0 font-mono text-xs text-foreground-muted">
        <span className="sr-only">{`${it.clientWizard.code} `}</span>
        {client.code}
      </span>
    </>
  );

  return (
    <WizardFrame
      caseStudy={null}
      current={current}
      reachable={complete}
      back={{ href: clientHref(client.id), label: it.clientWizard.backToClient }}
      eyebrow={it.clientWizard.editEyebrow}
      title={client.name}
      header={header}
      steps={CLIENT_WIZARD_STEPS}
      hrefFor={clientStepHref(client.id)}
    >
      {current === 1 ? (
        <ClientDetailsStep key={client.id} client={client} industries={caseStudy.CLIENT_INDUSTRIES} limits={limits} />
      ) : (
        <ClientMaterialStep key={client.id} clientId={client.id} initialAssets={assets} limits={clientMaterialLimits()} />
      )}
    </WizardFrame>
  );
}
