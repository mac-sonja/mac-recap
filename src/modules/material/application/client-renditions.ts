import type { AllowedContentType, AssetKind } from "@/modules/material/domain/files";
import {
  getRenditionInputSchema,
  hasRenditions,
  RENDITION_NOT_READY,
  RENDITION_SPECS,
  RENDITION_URL_TTL_SECONDS,
  type RenditionLink,
} from "@/modules/material/domain/rendition";
import { parseInput } from "@/modules/material/domain/validation";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import type { RenditionRepository } from "@/modules/material/ports/rendition-repository";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { storageNotConfigured, type Jobs } from "./deps";
import { renditionInputHash, specHash } from "./spec-hash";

/**
 * A client file as the material module renders it (Story 4.5c-2): the case-study module's
 * `getClientAsset`, removed or not. Client files take exactly the case material types.
 */
export interface ClientMediaFile {
  id: string;
  clientId: string;
  kind: AssetKind;
  contentType: AllowedContentType;
  /** Set once the file, or its client, is deleted. */
  deletedAt: string | null;
}

/** The case-study calls the client renditions need (wired to `@/modules/case-study` in index.ts). */
export interface ClientFiles {
  /** One client file by id, removed or not; `ok(null)` when there is none. */
  get(assetId: string): Promise<Result<ClientMediaFile | null>>;
}

/**
 * Enqueues the `rendition` job of a confirmed client image or video (Story 4.5c-2), as
 * `confirmUpload` does for a case file: `{ owner: "client", clientId }` in the payload,
 * the same input hash. Idempotent. Other kinds get no job. Any failure is logged (client
 * and actor ids only) and never returned: the upload stands without its renditions, and
 * the backfill makes them later.
 */
export function makeEnqueueClientRenditions({ jobs }: { jobs: Pick<Jobs, "enqueue"> }) {
  return async function enqueueClientRenditions(file: { id: string; clientId: string; kind: AssetKind }, actorId: string): Promise<void> {
    if (!hasRenditions(file.kind)) return;
    const ids = { clientId: file.clientId, actorId };
    try {
      const queued = await jobs.enqueue({
        kind: "rendition",
        subjectId: file.id,
        inputHash: renditionInputHash(file.id, file.kind),
        payload: { owner: "client", clientId: file.clientId },
      });
      if (!queued.ok) log.error(`client rendition job not enqueued: ${queued.error.code}`, ids);
    } catch {
      log.error("client rendition job not enqueued: enqueue threw", ids);
    }
  };
}

/**
 * A signed GET (15 minutes) for one rendition of a live client image or video:
 * `{ url, width, height, contentType }`, as `getRendition` for case files. Errors:
 * `INVALID_INPUT`, `NOT_FOUND` (no such file, a removed one, one of a deleted client, or a
 * spec of another kind), `RENDITION_NOT_READY`, `STORAGE_NOT_CONFIGURED`, the lookup and
 * signing errors. Reads only. The caller has already authorized access.
 */
export function makeGetClientRendition({
  files,
  renditions,
  storage,
}: {
  files: ClientFiles;
  renditions: Pick<RenditionRepository, "get">;
  storage: Pick<ObjectStorage, "presignKeys"> | null;
}) {
  return async function getClientRendition(assetId: unknown, specName: unknown): Promise<Result<RenditionLink>> {
    const parsed = parseInput(getRenditionInputSchema, { assetId, specName });
    if (!parsed.ok) return parsed;
    const spec = RENDITION_SPECS[parsed.value.specName];
    if (storage === null) return storageNotConfigured();

    const found = await files.get(parsed.value.assetId);
    if (!found.ok) return found;
    const file = found.value;
    if (file === null || file.deletedAt !== null || !hasRenditions(file.kind) || file.kind !== spec.source) {
      return err({ code: "NOT_FOUND", message: "No such file.", details: { assetId: parsed.value.assetId } });
    }

    const rendition = await renditions.get(file.id, specHash(spec));
    if (!rendition.ok) return rendition;
    if (rendition.value === null) {
      return err({ code: RENDITION_NOT_READY, message: "This display copy is not ready yet.", details: { assetId: file.id, specName: spec.name } });
    }

    const signed = await storage.presignKeys([rendition.value.path], RENDITION_URL_TTL_SECONDS);
    if (!signed.ok) return signed;
    const url = signed.value[0];
    if (url === null || url === undefined) return err({ code: "STORAGE_FAILED", message: "Could not prepare the file link." });
    const { width, height, contentType } = rendition.value;
    return ok({ url, width, height, contentType });
  };
}
