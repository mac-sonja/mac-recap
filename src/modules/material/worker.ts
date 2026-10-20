// Worker-only entry of the material module (Story 3.2). Only src/worker imports
// this file: it pulls in sharp and child_process (ffmpeg), which web code must
// never reach (AD-10; test/web-imports.test.ts). index.ts never imports it.
import * as jobs from "@/modules/jobs";
import type { JobHandler } from "@/modules/jobs";
import { assetKey, renditionKey } from "@/modules/material/adapters/asset-key";
import { createFfmpegVideoProcessor } from "@/modules/material/adapters/ffmpeg/video-processor";
import { createSharpImageProcessor } from "@/modules/material/adapters/sharp/image-processor";
import { createSupabaseAssetRepository } from "@/modules/material/adapters/supabase/asset-repository";
import { createSupabaseObjectStorage } from "@/modules/material/adapters/supabase/object-storage";
import { createSupabaseRenditionRepository } from "@/modules/material/adapters/supabase/rendition-repository";
import { makeBackfillRenditions, type BackfillSummary } from "@/modules/material/application/backfill-renditions";
import { makeRenditionHandler, type RenditionWorkerDeps } from "@/modules/material/application/make-renditions";
import type { Result } from "@/shared/result";

/**
 * The `rendition` job handler, wired to Supabase, sharp and ffmpeg. Register
 * it in the worker as `{ rendition: renditionHandler() }`. `overrides`
 * replaces single dependencies (tests).
 */
export function renditionHandler(overrides: Partial<RenditionWorkerDeps> = {}): JobHandler {
  const image = overrides.image ?? createSharpImageProcessor();
  return makeRenditionHandler({
    assets: createSupabaseAssetRepository(),
    renditions: createSupabaseRenditionRepository(),
    storage: createSupabaseObjectStorage(),
    keys: {
      original: (asset) => assetKey(asset.caseId, asset.id, asset.contentType),
      rendition: (asset, hash, ext) => renditionKey(asset.caseId, asset.id, hash, ext),
    },
    image,
    video: createFfmpegVideoProcessor({ image }),
    ...overrides,
  });
}

export { checkDevProject } from "@/modules/material/application/backfill-renditions";
export type { BackfillSummary } from "@/modules/material/application/backfill-renditions";

/**
 * Dev tooling: enqueues `rendition` for every live image/video missing a row
 * for its current spec hashes (`npm run dev:renditions-backfill`). Call only
 * after `checkDevProject` passed.
 */
export function backfillRenditions(): Promise<Result<BackfillSummary>> {
  return makeBackfillRenditions({
    assets: createSupabaseAssetRepository(),
    renditions: createSupabaseRenditionRepository(),
    jobs: { enqueue: jobs.enqueue },
  })();
}
