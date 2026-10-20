import type { BackfillSummary } from "@/modules/material/worker";
import { getEnv } from "@/shared/env";
import { log } from "@/shared/log";
import type { Result } from "@/shared/result";

/** What the backfill command needs, injected so tests touch no database. */
export interface BackfillDeps {
  loadEnv: () => { SUPABASE_URL: string };
  checkDevProject: (supabaseUrl: string) => Result<"dev" | "local">;
  backfill: () => Promise<Result<BackfillSummary>>;
}

/**
 * `npm run dev:renditions-backfill` (Story 3.2, dev only): validates the
 * environment, refuses anything but mac-recap-dev or a local stack (the
 * production project above all), then enqueues the missing `rendition` jobs
 * for the worker to pick up. Resolves to the process exit code: 0 done, 1 refused or failed.
 */
export async function runRenditionsBackfill(deps: BackfillDeps): Promise<number> {
  let url: string;
  try {
    url = deps.loadEnv().SUPABASE_URL;
  } catch (error) {
    console.error("Invalid environment, refusing to start:", error);
    return 1;
  }
  const project = deps.checkDevProject(url);
  if (!project.ok) {
    log.error(`renditions backfill refused: ${project.error.code}`);
    return 1;
  }
  const done = await deps.backfill();
  if (!done.ok) {
    log.error(`renditions backfill failed: ${done.error.code}`);
    return 1;
  }
  const { checked, enqueued, failed } = done.value;
  log.info(`renditions backfill on ${project.value}: ${checked} files checked, ${enqueued} jobs enqueued, ${failed} failed`);
  return failed > 0 ? 1 : 0;
}

/** The real dependencies; the material worker entry is loaded only after the environment check. */
export const defaultBackfillDeps = async (): Promise<BackfillDeps> => {
  const material = await import("@/modules/material/worker");
  return { loadEnv: getEnv, checkDevProject: material.checkDevProject, backfill: material.backfillRenditions };
};
