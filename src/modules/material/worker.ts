// Worker-only entry of the material module (Story 3.2). Only src/worker imports
// this file: it pulls in sharp and child_process (ffmpeg), which web code must
// never reach (AD-10; test/web-imports.test.ts). index.ts never imports it.
import * as caseStudy from "@/modules/case-study";
import * as jobs from "@/modules/jobs";
import type { JobHandler } from "@/modules/jobs";
import { assetKey, clientAssetKey, clientRenditionKey, renditionKey } from "@/modules/material/adapters/asset-key";
import { createFfmpegVideoProcessor } from "@/modules/material/adapters/ffmpeg/video-processor";
import { createSharpImageProcessor } from "@/modules/material/adapters/sharp/image-processor";
import { createSupabaseAssetRepository } from "@/modules/material/adapters/supabase/asset-repository";
import { createSupabaseObjectStorage } from "@/modules/material/adapters/supabase/object-storage";
import {
  createSupabaseClientRenditionRepository,
  createSupabaseRenditionRepository,
} from "@/modules/material/adapters/supabase/rendition-repository";
import { makeBackfillRenditions, type BackfillSummary } from "@/modules/material/application/backfill-renditions";
import type { ClientMediaFile } from "@/modules/material/application/client-renditions";
import { makeRenditionHandler, routeRenditionJobs, type RenditionWorkerDeps } from "@/modules/material/application/make-renditions";
import { ok, type Result } from "@/shared/result";

/** The parts both handlers share, built once: the processors and storage. */
function shared(overrides: Partial<RenditionWorkerDeps>) {
  const image = overrides.image ?? createSharpImageProcessor();
  return {
    storage: overrides.storage ?? createSupabaseObjectStorage(),
    image,
    video: overrides.video ?? createFfmpegVideoProcessor({ image }),
  };
}

/**
 * The `rendition` job handler, wired to Supabase, sharp and ffmpeg. Register
 * it in the worker as `{ rendition: renditionHandler() }`. A client file's job
 * (`payload.owner = "client"`, Story 4.5c-2) renders the client file with the same
 * specs and processors, into `client_rendition`; any other renders a case asset.
 * `overrides` replaces single dependencies of the case handler (tests); `clientOverrides`
 * those of the client handler.
 */
export function renditionHandler(
  overrides: Partial<RenditionWorkerDeps> = {},
  clientOverrides: Partial<RenditionWorkerDeps<ClientMediaFile>> = {},
): JobHandler {
  const common = shared(overrides);
  const cases = makeRenditionHandler({
    assets: createSupabaseAssetRepository(),
    renditions: createSupabaseRenditionRepository(),
    keys: {
      original: (asset) => assetKey(asset.caseId, asset.id, asset.contentType),
      rendition: (asset, hash, ext) => renditionKey(asset.caseId, asset.id, hash, ext),
    },
    ...common,
    ...overrides,
  });
  const client = makeRenditionHandler<ClientMediaFile>({
    assets: { getById: (id) => caseStudy.getClientAsset(id) },
    renditions: createSupabaseClientRenditionRepository(),
    keys: {
      original: (file) => clientAssetKey(file.clientId, file.id, file.contentType),
      rendition: (file, hash, ext) => clientRenditionKey(file.clientId, file.id, hash, ext),
    },
    logIds: (file) => ({ clientId: file.clientId }),
    ...common,
    ...clientOverrides,
  });
  return routeRenditionJobs(cases, client);
}

export { checkDevProject } from "@/modules/material/application/backfill-renditions";
export type { BackfillSummary } from "@/modules/material/application/backfill-renditions";

/**
 * Dev tooling: enqueues `rendition` for every live image/video missing a row
 * for its current spec hashes (`npm run dev:renditions-backfill`), case files first,
 * then client files (Story 4.5c-2). Call only after `checkDevProject` passed.
 */
export async function backfillRenditions(): Promise<Result<BackfillSummary>> {
  const enqueue = { enqueue: jobs.enqueue };
  const ofCases = await makeBackfillRenditions({
    assets: createSupabaseAssetRepository(),
    renditions: createSupabaseRenditionRepository(),
    jobs: enqueue,
  })();
  if (!ofCases.ok) return ofCases;
  const ofClients = await makeBackfillRenditions({
    assets: { listLiveMediaPage: caseStudy.listLiveClientMediaPage },
    renditions: createSupabaseClientRenditionRepository(),
    jobs: enqueue,
    payloadOf: (file) => ({ owner: "client", clientId: file.clientId }),
  })();
  if (!ofClients.ok) return ofClients;
  return ok({
    checked: ofCases.value.checked + ofClients.value.checked,
    enqueued: ofCases.value.enqueued + ofClients.value.enqueued,
    failed: ofCases.value.failed + ofClients.value.failed,
  });
}
