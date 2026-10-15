/**
 * The new-case-study wizard on an existing case. With no `step`, the page opens the
 * first incomplete step (Dettagli when the case has material, else Materiale).
 * `step` names one explicitly: `&step=1`, `&step=2` or `&step=3` (2 and 3 only open
 * when the case has material).
 */
export const wizardHref = (id: string, step?: 1 | 2 | 3) =>
  `/case-studies/new?caseId=${encodeURIComponent(id)}${step === undefined ? "" : `&step=${step}`}`;

/** The wizard's step 0 with `clientId` preselected in the client picker (a client's page). */
export const newCaseForClientHref = (clientId: string) => `/case-studies/new?clientId=${encodeURIComponent(clientId)}`;
