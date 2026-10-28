import type { CaseStatus } from "@/shared/case-status";

/**
 * The new-case-study wizard on an existing case (Story 2.17). With no `step`, the
 * page opens the first incomplete step: Dettagli when the business line is missing,
 * else Materiale when there is no file, else Genera. `step` names one explicitly:
 * `&step=1` Dettagli, `&step=2` Materiale (once the business line is set) or
 * `&step=3` Genera (once there is a file too).
 */
export const wizardHref = (id: string, step?: 1 | 2 | 3) =>
  `/case-studies/new?caseId=${encodeURIComponent(id)}${step === undefined ? "" : `&step=${step}`}`;

/** The wizard's step 1 with `clientId` preselected in the client picker (a client's page). */
export const newCaseForClientHref = (clientId: string) => `/case-studies/new?clientId=${encodeURIComponent(clientId)}`;

/** A client's page. */
export const clientHref = (id: string) => `/clients/${encodeURIComponent(id)}`;

/** The Clienti list with the add panel open (**Nuovo cliente**). */
export const newClientPanelHref = () => "/clients?nuovo=1";

/** A client's page with the edit panel open (**Modifica cliente**). */
export const editClientPanelHref = (id: string) => `${clientHref(id)}?modifica=1`;

/** A case's configurator (Story 4.2): only a case in Da approvare or Approvato opens there. */
export const configuratorHref = (id: string) => `/case-studies/${encodeURIComponent(id)}/configurator`;

/** An approved case's read-only detail page (Story 5.2): every role that may `view` it. */
export const caseViewHref = (id: string) => `/case-studies/${encodeURIComponent(id)}`;

/**
 * Where a case opens from a list: a Bozza reopens the wizard (no step, so it picks the first
 * incomplete one); an Approvato opens its detail page for every role; Da approvare opens the
 * configurator for a role that may `edit`. In elaborazione, or Da approvare without `edit`,
 * opens nothing (null).
 */
export const caseHref = (id: string, status: CaseStatus, canEdit: boolean): string | null =>
  status === "draft"
    ? wizardHref(id)
    : status === "approved"
      ? caseViewHref(id)
      : canEdit && status === "in_review"
        ? configuratorHref(id)
        : null;

/** The Case studies table filtered to one status (`?stato=`), e.g. the To review queue. */
export const caseStudiesHref = (status: CaseStatus) => `/case-studies?stato=${encodeURIComponent(status)}`;
