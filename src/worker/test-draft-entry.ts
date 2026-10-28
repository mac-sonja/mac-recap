import { defaultTestDraftDeps, runTestDraft } from "./test-draft";

// Dev-only command, bundled to dist/test-draft.js by `npm run dev:test-draft -- <caseId>`.
void defaultTestDraftDeps()
  .then((deps) => runTestDraft(deps, process.argv.slice(2)))
  .then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error("test draft crashed:", error);
      process.exit(1);
    },
  );
