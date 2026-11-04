import { JOB_ABORTED, type Job, type JobHandler, type JobOutcome } from "@/modules/jobs";
import type { Asset } from "@/modules/material/domain/asset";
import { MAX_FILE_BYTES, type AssetKind } from "@/modules/material/domain/files";
import {
  hasRenditions,
  RENDITION_SPECS,
  RENDITION_TOO_LARGE,
  SPECS_BY_KIND,
  type RenditionSpec,
} from "@/modules/material/domain/rendition";
import type { ImageProcessor, RenditionOutput, VideoProcessor, VideoSession } from "@/modules/material/ports/media-processing";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import type { RenditionRepository } from "@/modules/material/ports/rendition-repository";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { specHash } from "./spec-hash";

/**
 * What the handler renders: a case asset, or a client file (Story 4.5c-2), as its own
 * repository reads it. `deletedAt` is set once it is removed.
 */
export interface RenditionSource {
  id: string;
  kind: AssetKind;
  deletedAt: string | null;
}

/** Storage keys, built by `adapters/asset-key.ts` and injected by `worker.ts` (only adapters build keys). */
export interface RenditionKeys<S extends RenditionSource = Asset> {
  original(source: S): string;
  rendition(source: S, specHash: string, ext: RenditionSpec["ext"]): string;
}

export interface RenditionWorkerDeps<S extends RenditionSource = Asset> {
  assets: { getById(id: string): Promise<Result<S | null>> };
  renditions: Pick<RenditionRepository, "listForAsset" | "upsert">;
  storage: Pick<ObjectStorage, "download" | "upload">;
  keys: RenditionKeys<S>;
  image: ImageProcessor;
  video: VideoProcessor;
  /** The ids the log lines carry (never a key or a name): the case's by default, `{ clientId }` for a client file. */
  logIds?: (source: S) => Record<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const abortedOutcome = (): JobOutcome => err({ code: JOB_ABORTED, message: "Stopped before the renditions were stored." });

/** The asset was removed while the copies were made: nothing more to do. */
class AssetRemoved {}

/**
 * The `rendition` job handler (worker only, Story 3.2). `subjectId` is the
 * asset; `payload.caseId` maps a permanent failure to `job_failed` on its case.
 * It reads the original once, makes each spec of the asset's kind that has no
 * row yet (so a retry skips what already exists), uploads it to its rendition
 * key and upserts its row. It never writes, moves or deletes the original and
 * never calls an LLM. An abort stops it before the next write (and kills
 * ffmpeg). A file that cannot be decoded, or a copy over the bucket's 50 MB
 * cap, fails with `retryable: false`. A removed asset is skipped (ok), also
 * when it is removed while the copies are made (`upsert_rendition` refuses it).
 */
export function makeRenditionHandler<S extends RenditionSource = Asset>(deps: RenditionWorkerDeps<S>): JobHandler {
  const caseIdOf = (job: Job): string | null => {
    const caseId = job.payload.caseId;
    return typeof caseId === "string" && UUID.test(caseId) ? caseId : null;
  };
  const idsOf = deps.logIds ?? ((source: S): Record<string, string> => ("caseId" in source && typeof source.caseId === "string" ? { caseId: source.caseId } : {}));

  return {
    caseIdOf,

    async run(job, signal) {
      const assetId = job.subjectId;
      const caseId = caseIdOf(job) ?? undefined;
      const found = await deps.assets.getById(assetId);
      if (!found.ok) return found;
      const asset = found.value;
      if (asset === null) {
        return err({ code: "NOT_FOUND", message: "The file of this rendition job does not exist.", retryable: false });
      }
      if (asset.deletedAt !== null) {
        log.info("rendition skipped: the file was removed", { ...idsOf(asset), jobId: job.id });
        return ok(undefined);
      }
      if (!hasRenditions(asset.kind)) {
        return err({ code: "NOT_RENDERABLE", message: "Only images and videos get renditions.", retryable: false });
      }

      const existing = await deps.renditions.listForAsset(asset.id);
      if (!existing.ok) return existing;
      const made = new Set(existing.value.map((r) => r.specHash));
      const missing = SPECS_BY_KIND[asset.kind].map((name) => RENDITION_SPECS[name]).filter((spec) => !made.has(specHash(spec)));
      if (missing.length === 0) return ok(undefined);
      if (signal.aborted) return abortedOutcome();

      const original = await deps.storage.download(deps.keys.original(asset));
      if (!original.ok) return original;
      if (original.value === null) {
        return err({ code: "ORIGINAL_NOT_FOUND", message: "The original file is missing from storage.", retryable: false });
      }
      const bytes = original.value;
      if (signal.aborted) return abortedOutcome();

      const store = async (spec: RenditionSpec, output: RenditionOutput): Promise<JobOutcome | AssetRemoved> => {
        if (signal.aborted) return abortedOutcome();
        // The bucket refuses objects over its cap, so a retry could never succeed.
        if (output.bytes.byteLength > MAX_FILE_BYTES) {
          return err({ code: RENDITION_TOO_LARGE, message: "The display copy is over the storage limit.", retryable: false });
        }
        const hash = specHash(spec);
        const key = deps.keys.rendition(asset, hash, spec.ext);
        const uploaded = await deps.storage.upload(key, output.bytes, spec.contentType);
        if (!uploaded.ok) return uploaded;
        if (signal.aborted) return abortedOutcome();
        const saved = await deps.renditions.upsert({
          assetId: asset.id,
          specHash: hash,
          path: key,
          contentType: spec.contentType,
          width: output.width,
          height: output.height,
          sizeBytes: output.bytes.byteLength,
        });
        if (!saved.ok && saved.error.code === "NOT_FOUND") return new AssetRemoved();
        return saved.ok ? ok(undefined) : saved;
      };
      const skipped = () => {
        log.info("rendition skipped: the file was removed while rendering", { ...idsOf(asset), jobId: job.id });
        return ok(undefined);
      };

      if (asset.kind === "image") {
        for (const spec of missing) {
          if (spec.source !== "image") continue;
          const output = await deps.image.render(bytes, spec, signal);
          if (!output.ok) return output;
          const stored = await store(spec, output.value);
          if (stored instanceof AssetRemoved) return skipped();
          if (!stored.ok) return stored;
        }
        log.info("renditions made", { ...idsOf(asset), ...(caseId === undefined ? {} : { caseId }), jobId: job.id });
        return ok(undefined);
      }

      const opened: Result<VideoSession> = await deps.video.open(bytes, signal);
      if (!opened.ok) return opened;
      const session = opened.value;
      try {
        for (const spec of missing) {
          if (spec.source !== "video") continue;
          const output = await session.render(spec);
          if (!output.ok) return output;
          const stored = await store(spec, output.value);
          if (stored instanceof AssetRemoved) return skipped();
          if (!stored.ok) return stored;
        }
      } finally {
        // A failed clean-up never replaces the real outcome.
        try {
          await session.close();
        } catch {
          log.warn("rendition temp files not removed", { ...idsOf(asset), jobId: job.id });
        }
      }
      log.info("renditions made", { ...idsOf(asset), ...(caseId === undefined ? {} : { caseId }), jobId: job.id });
      return ok(undefined);
    },
  };
}

/** A `rendition` job of a client file (Story 4.5c-2) carries `payload.owner = "client"` and its `clientId`. */
export const isClientRenditionJob = (job: Pick<Job, "payload">): boolean => job.payload.owner === "client";

/**
 * The one `rendition` handler the worker registers: a client file's job (`owner:
 * "client"`) runs `client`, any other runs `cases`. One job kind for both, so the `job`
 * table, its kind check and the worker's claim stay as they are (Story 4.5c-2). A client
 * job has no case, so a permanent failure is only logged.
 */
export function routeRenditionJobs(cases: JobHandler, client: JobHandler): JobHandler {
  return {
    caseIdOf: (job) => (isClientRenditionJob(job) ? null : (cases.caseIdOf?.(job) ?? null)),
    run: (job, signal) => (isClientRenditionJob(job) ? client.run(job, signal) : cases.run(job, signal)),
  };
}
