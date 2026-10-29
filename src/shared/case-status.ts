/**
 * Case statuses (AD-3, interim OP 8 set). The single definition: the access
 * policy reasons about them and the case-study module stores them, and both
 * module domains may import only `src/shared`. The `case_study.status` check
 * constraint must list exactly these, in this order.
 */
export const CASE_STATUSES = ["draft", "generating", "in_review", "approved"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** How often a screen that shows a `generating` case asks the server again (Story 3.7b). */
export const GENERATING_REFRESH_MS = 5_000;
