import { StorageApiError } from "@supabase/supabase-js";
import { assetKey } from "@/modules/material/adapters/asset-key";
import type { ObjectStorage, UploadTarget } from "@/modules/material/ports/object-storage";
import { log } from "@/shared/log";
import { err, ok } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

/** The private bucket created by `20261014160000_material_storage_bucket.sql`. */
export const MATERIAL_BUCKET = "material";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const keyOf = (target: UploadTarget) => assetKey(target.caseId, target.assetId, target.contentType);

/** The only keys `upload` writes: `cases/{caseId}/assets/{assetId}/renditions/{specHash}.{webp|mp4}`. */
const RENDITION_KEY = /^cases\/[0-9a-f-]{36}\/assets\/[0-9a-f-]{36}\/renditions\/[0-9a-f]{16}\.(webp|mp4)$/;

/** The case id at the start of a key, for logs (never the key itself). */
const caseIdOfKey = (key: string) => /^cases\/([0-9a-f-]{36})\//.exec(key)?.[1];

/** The HTTP status of a storage API error, else the error's name (`StorageUnknownError` for a network error). */
function errorLabel(error: unknown): string {
  if (error instanceof StorageApiError) return String(error.status);
  return (error as Error | null)?.name ?? "unknown";
}

/**
 * A missing object: `info()` answers 404, or 400 on older storage versions with
 * a "not found" message or a `statusCode` of "404". Any other 400 is a real error.
 */
function isNotFound(error: unknown): boolean {
  if (!(error instanceof StorageApiError)) return false;
  if (error.status === 404) return true;
  return error.status === 400 && (error.statusCode === "404" || /not.?found/i.test(error.message));
}

/**
 * Supabase Storage adapter for the `material` bucket, through the service-role
 * client (the bucket has no policies, so no browser key can reach it). The
 * client is built on first use and reused by this adapter instance. Objects
 * are never deleted, and only rendition keys are ever written from the server.
 * Errors are logged with the case id only, never the key.
 */
export function createSupabaseObjectStorage(client: () => AdminClient = createSupabaseAdminClient): ObjectStorage {
  let memo: AdminClient | undefined;
  const bucket = () => {
    memo ??= client();
    return memo.storage.from(MATERIAL_BUCKET);
  };

  /** Signs `paths` in one storage call, in order; `null` for a path that could not be signed. */
  async function signPaths(paths: string[], ttlSeconds: number, caseId: string | undefined) {
    try {
      const { data, error } = await bucket().createSignedUrls(paths, ttlSeconds);
      if (error) throw error;
      const byPath = new Map(data.filter((d) => d.path !== null && d.error === null).map((d) => [d.path, d.signedUrl]));
      const urls = paths.map((path) => byPath.get(path) ?? null);
      const unsigned = urls.filter((url) => url === null).length;
      if (unsigned > 0) log.warn(`storage presign gets: ${unsigned} of ${paths.length} not signed`, { caseId });
      return ok(urls);
    } catch (error) {
      log.error(`storage presign gets failed: ${errorLabel(error)}`, { caseId });
      return err({ code: "STORAGE_FAILED", message: "Could not prepare the file links." });
    }
  }

  return {
    async presignUpload(target) {
      try {
        const { data, error } = await bucket().createSignedUploadUrl(keyOf(target));
        if (error) throw error;
        return ok({
          url: data.signedUrl,
          method: "PUT",
          headers: { "content-type": target.contentType, "x-upsert": "false" },
        });
      } catch (error) {
        log.error(`storage presign failed: ${errorLabel(error)}`, { caseId: target.caseId });
        return err({ code: "STORAGE_FAILED", message: "Could not prepare the upload." });
      }
    },

    async presignDownload(target, ttlSeconds) {
      try {
        const { data, error } = await bucket().createSignedUrl(keyOf(target), ttlSeconds);
        if (error) throw error;
        return ok(data.signedUrl);
      } catch (error) {
        log.error(`storage presign get failed: ${errorLabel(error)}`, { caseId: target.caseId });
        return err({ code: "STORAGE_FAILED", message: "Could not prepare the file link." });
      }
    },

    async presignDownloads(targets, ttlSeconds) {
      if (targets.length === 0) return ok([]);
      return signPaths(targets.map(keyOf), ttlSeconds, targets[0].caseId);
    },

    async presignKeys(keys, ttlSeconds) {
      if (keys.length === 0) return ok([]);
      return signPaths([...keys], ttlSeconds, caseIdOfKey(keys[0]));
    },

    async download(key) {
      const caseId = caseIdOfKey(key);
      try {
        const { data, error } = await bucket().download(key);
        if (error) throw error;
        return ok(new Uint8Array(await data.arrayBuffer()));
      } catch (error) {
        if (isNotFound(error)) return ok(null);
        log.error(`storage download failed: ${errorLabel(error)}`, { caseId });
        return err({ code: "STORAGE_FAILED", message: "Could not read the file." });
      }
    },

    async upload(key, bytes, contentType) {
      if (!RENDITION_KEY.test(key)) {
        // Only rendition copies are ever written from the server; an original never is.
        return err({ code: "STORAGE_WRITE_REFUSED", message: "Only rendition keys can be written." });
      }
      try {
        const { error } = await bucket().upload(key, bytes, { contentType, upsert: true });
        if (error) throw error;
        return ok(undefined);
      } catch (error) {
        log.error(`storage upload failed: ${errorLabel(error)}`, { caseId: caseIdOfKey(key) });
        return err({ code: "STORAGE_FAILED", message: "Could not store the file." });
      }
    },

    async head(target) {
      try {
        const { data, error } = await bucket().info(keyOf(target));
        if (error) throw error;
        return ok({ sizeBytes: data.size ?? 0, contentType: data.contentType ?? null });
      } catch (error) {
        if (isNotFound(error)) return ok(null);
        log.error(`storage head failed: ${errorLabel(error)}`, { caseId: target.caseId });
        return err({ code: "STORAGE_FAILED", message: "Could not check the upload." });
      }
    },
  };
}
