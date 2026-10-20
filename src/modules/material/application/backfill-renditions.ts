import { RENDITION_SPECS, SPECS_BY_KIND, hasRenditions } from "@/modules/material/domain/rendition";
import type { AssetRepository } from "@/modules/material/ports/asset-repository";
import type { RenditionRepository } from "@/modules/material/ports/rendition-repository";
import { err, ok, type Result } from "@/shared/result";
import type { Jobs } from "./deps";
import { renditionInputHash, specHash } from "./spec-hash";

export interface BackfillSummary {
  /** Live images and videos of live cases looked at. */
  checked: number;
  /** Rendition jobs enqueued (or found already live: enqueue is idempotent). */
  enqueued: number;
  /** Enqueues that failed. */
  failed: number;
}

/** Assets per page; each page is one asset read and one rendition read. */
export const BACKFILL_PAGE = 100;

const ALL_HASHES = Object.values(RENDITION_SPECS).map(specHash);

/**
 * Dev tooling (`npm run dev:renditions-backfill`): enqueues a `rendition` job
 * for every live image or video of a live case that lacks a row for one of
 * its kind's current spec hashes (files from before Story 3.2, failed jobs,
 * failed enqueues, a bumped spec version). Idempotent: a job already queued or
 * running is reused. Writes no rendition itself. Errors: the read errors.
 */
export function makeBackfillRenditions({
  assets,
  renditions,
  jobs,
}: {
  assets: Pick<AssetRepository, "listLiveMediaPage">;
  renditions: Pick<RenditionRepository, "listFor">;
  jobs: Pick<Jobs, "enqueue">;
}) {
  return async function backfillRenditions(): Promise<Result<BackfillSummary>> {
    const summary: BackfillSummary = { checked: 0, enqueued: 0, failed: 0 };
    let after: string | null = null;
    for (;;) {
      const page = await assets.listLiveMediaPage(after, BACKFILL_PAGE);
      if (!page.ok) return page;
      if (page.value.length === 0) return ok(summary);
      const made = await renditions.listFor(
        page.value.map((asset) => asset.id),
        ALL_HASHES,
      );
      if (!made.ok) return made;
      const have = new Set(made.value.map((r) => `${r.assetId}/${r.specHash}`));
      for (const asset of page.value) {
        if (!hasRenditions(asset.kind)) continue;
        summary.checked += 1;
        const missing = SPECS_BY_KIND[asset.kind].some((name) => !have.has(`${asset.id}/${specHash(RENDITION_SPECS[name])}`));
        if (!missing) continue;
        try {
          const queued = await jobs.enqueue({
            kind: "rendition",
            subjectId: asset.id,
            inputHash: renditionInputHash(asset.id, asset.kind),
            payload: { caseId: asset.caseId },
          });
          if (queued.ok) summary.enqueued += 1;
          else summary.failed += 1;
        } catch {
          summary.failed += 1;
        }
      }
      if (page.value.length < BACKFILL_PAGE) return ok(summary);
      after = page.value[page.value.length - 1].id;
    }
  };
}

/** The Supabase project ref treated as production (`mac-recap`): dev tooling refuses it. */
export const PRODUCTION_PROJECT_REF = "qmptpiykbucbnsrqbgid";
/** The hosted dev project (`mac-recap-dev`). */
export const DEV_PROJECT_REF = "jydtnzbmzetbpyjppmxw";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal", "kong"]);

/**
 * Dev tooling runs only against mac-recap-dev or a local stack. Refuses the
 * production project (`PRODUCTION_PROJECT_REF`) and any other host: `err
 * PRODUCTION_REFUSED` / `UNKNOWN_PROJECT_REFUSED`.
 */
export function checkDevProject(supabaseUrl: string): Result<"dev" | "local"> {
  let host: string;
  try {
    host = new URL(supabaseUrl).hostname.toLowerCase();
  } catch {
    return err({ code: "UNKNOWN_PROJECT_REFUSED", message: "SUPABASE_URL is not a URL." });
  }
  if (host.includes(PRODUCTION_PROJECT_REF)) {
    return err({ code: "PRODUCTION_REFUSED", message: "Refusing to run dev tooling against the production project." });
  }
  if (host === `${DEV_PROJECT_REF}.supabase.co`) return ok("dev");
  if (LOCAL_HOSTS.has(host)) return ok("local");
  return err({ code: "UNKNOWN_PROJECT_REFUSED", message: "Dev tooling runs only against mac-recap-dev or a local stack." });
}
