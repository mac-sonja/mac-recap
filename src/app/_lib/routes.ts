/** The new-case-study wizard on an existing case: reopens it at step 1. */
export const wizardHref = (id: string) => `/case-studies/new?caseId=${encodeURIComponent(id)}`;
