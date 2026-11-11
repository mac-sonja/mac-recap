import { mergeConfig } from "vitest/config";
import base from "./vitest.config.mjs";
import { GUARDRAIL_INCLUDE } from "./test/guardrails/suite";

// `npm run test:guardrails` (Story 5.8, docs/guardrail-check.md): only the tests tagged
// `NFRn guardrail`, from the files that hold them, with one result per guardrail at the end.
// mergeConfig concatenates arrays, so the base include is dropped first.
const baseTest = { ...base.test };
delete baseTest.include;

export default mergeConfig(
  { ...base, test: baseTest },
  {
    test: {
      include: GUARDRAIL_INCLUDE,
      testNamePattern: /NFR\d+ guardrail/,
      reporters: ["verbose", "./test/guardrails/reporter.ts"],
    },
  },
);
