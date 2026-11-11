/**
 * The guardrail suite (Story 5.8; docs/guardrail-check.md): `npm run test:guardrails` runs,
 * from these files, only the tests whose name holds `NFRn guardrail`, and reports each
 * guardrail separately (test/guardrails/reporter.ts). `npm test` runs the same tests as part
 * of everything. A file with a tagged test that is missing here fails
 * test/guardrails/suite.test.ts.
 */
export const GUARDRAILS = ["NFR1", "NFR2", "NFR3", "NFR6", "NFR7"] as const;
export type Guardrail = (typeof GUARDRAILS)[number];

/** The tag in a test's or a describe's name that puts it in the suite. */
export const GUARDRAIL_TAG = /\b(NFR\d+) guardrail\b/;

/** The suite's own checks (test/guardrails/suite.test.ts): run by `test:guardrails` too, counted under no guardrail. */
export const SUITE_TAG = /\bguardrail suite\b/;

/** What `test:guardrails` runs: a guardrail's tests and the suite's own checks. */
export const GUARDRAIL_TEST_NAMES = new RegExp(`${GUARDRAIL_TAG.source}|${SUITE_TAG.source}`);

/** Every file outside test/guardrails with a tagged test (test/db/** runs with `npm run test:db` instead). */
export const TAGGED_FILES = [
  // NFR1: renditions only downscale; nothing but the upload flow writes an original.
  "src/modules/material/domain/rendition.test.ts",
  "src/modules/material/adapters/sharp/image-processor.test.ts",
  "src/modules/material/application/make-renditions.test.ts",
  "src/modules/material/adapters/supabase/object-storage.test.ts",
  // NFR3 (the matrix through the real actor resolver) and NFR7 (approved-only exports, per role).
  "test/permissions.test.ts",
  // NFR6: no material, no generation; fewer than 2 client images, no intro.
  "src/app/(tool)/case-studies/actions.test.ts",
  "src/modules/generation/application/generate-case.test.ts",
  "src/modules/case-study/application/client-intro.test.ts",
  // NFR7: the export worker re-checks approval before it draws.
  "src/modules/rendering/application/export-handler.test.ts",
] as const;

/** What `vitest.guardrails.config.mts` includes. */
export const GUARDRAIL_INCLUDE = ["test/guardrails/**/*.test.ts", ...TAGGED_FILES];
