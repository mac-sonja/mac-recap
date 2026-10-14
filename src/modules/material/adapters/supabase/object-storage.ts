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
 * are never deleted. Errors are logged with the case id only, never the key.
 */
export function createSupabaseObjectStorage(client: () => AdminClient = createSupabaseAdminClient): ObjectStorage {
  let memo: AdminClient | undefined;
  const bucket = () => {
    memo ??= client();
    return memo.storage.from(MATERIAL_BUCKET);
  };

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
      const caseId = targets[0].caseId;
      const paths = targets.map(keyOf);
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
