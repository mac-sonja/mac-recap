/**
 * The new-case-study wizard on an existing case: step 1 by default, or step 2
 * (`&step=2`), which the page opens only when the case has material.
 */
export const wizardHref = (id: string, step?: 2) =>
  `/case-studies/new?caseId=${encodeURIComponent(id)}${step === undefined ? "" : `&step=${step}`}`;
