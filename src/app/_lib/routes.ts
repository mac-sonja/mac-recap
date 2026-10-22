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
