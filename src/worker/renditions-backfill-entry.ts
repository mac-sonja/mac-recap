import { defaultBackfillDeps, runRenditionsBackfill } from "./renditions-backfill";

// Dev-only command, bundled to dist/renditions-backfill.js by `npm run dev:renditions-backfill`.
void defaultBackfillDeps()
  .then(runRenditionsBackfill)
  .then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error("renditions backfill crashed:", error);
      process.exit(1);
    },
  );
