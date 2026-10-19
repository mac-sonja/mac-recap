import { StorageApiError } from "@supabase/supabase-js";
import { imageSize } from "@/modules/case-study/adapters/image-size";
import { logoKey } from "@/modules/case-study/adapters/logo-key";
import { LOGO_MAX_BYTES } from "@/modules/case-study/domain/case-study";
import type { LogoStorage, LogoTarget } from "@/modules/case-study/ports/logo-storage";
import { log } from "@/shared/log";
import { err, ok } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

/**
 * The private bucket created by `20261014160000_material_storage_bucket.sql`.
 * Logos share it under `clients/` (AD-8); no new bucket, no limit change.
 */
export const LOGO_BUCKET = "material";

/** Signed GETs live at most this long (AD-8). */
export const MAX_DOWNLOAD_TTL_SECONDS = 15 * 60;

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const keyOf = (target: LogoTarget) => logoKey(target.clientId, target.logoId, target.contentType);

/** The HTTP status of a storage API error, else the error's name (`StorageUnknownError` for a network error). */
export function errorLabel(error: unknown): string {
  if (error instanceof StorageApiError) return String(error.status);
  return (error as Error | null)?.name ?? "unknown";
}

/** A missing object: 404, or 400 with a "not found" message or a `statusCode` of "404" on older storage versions. */
export function isNotFound(error: unknown): boolean {
  if (!(error instanceof StorageApiError)) return false;
  if (error.status === 404) return true;
  return error.status === 400 && (error.statusCode === "404" || /not.?found/i.test(error.message));
}

/**
 * Supabase Storage adapter for client logos, through the service-role client
 * (the bucket has no policies, so no browser key can reach it). Copied from the
 * material adapter's pattern, never imported (module boundary). Only a replaced or
 * removed logo's object is deleted. Errors are logged with the client id only, never the key.
 */
export function createSupabaseLogoStorage(client: () => AdminClient = createSupabaseAdminClient): LogoStorage {
  let memo: AdminClient | undefined;
  const bucket = () => {
    memo ??= client();
    return memo.storage.from(LOGO_BUCKET);
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
        log.error(`logo presign failed: ${errorLabel(error)}`, { clientId: target.clientId });
        return err({ code: "STORAGE_FAILED", message: "Could not prepare the upload." });
      }
    },

    async presignDownload(target, ttlSeconds) {
      try {
        const { data, error } = await bucket().createSignedUrl(keyOf(target), Math.min(ttlSeconds, MAX_DOWNLOAD_TTL_SECONDS));
        if (error) throw error;
        return ok(data.signedUrl);
      } catch (error) {
        log.error(`logo presign get failed: ${errorLabel(error)}`, { clientId: target.clientId });
        return err({ code: "STORAGE_FAILED", message: "Could not prepare the logo link." });
      }
    },

    async head(target) {
      try {
        const { data, error } = await bucket().info(keyOf(target));
        if (error) throw error;
        return ok({ sizeBytes: data.size ?? 0, contentType: data.contentType ?? null });
      } catch (error) {
        if (isNotFound(error)) return ok(null);
        log.error(`logo head failed: ${errorLabel(error)}`, { clientId: target.clientId });
        return err({ code: "STORAGE_FAILED", message: "Could not check the upload." });
      }
    },

    async dimensions(target) {
      let bytes: Uint8Array;
      try {
        const { data, error } = await bucket().download(keyOf(target));
        if (error) throw error;
        // `head` has already bounded the size; this is the backstop before reading.
        if (data.size > LOGO_MAX_BYTES) return ok({ format: null, width: 0, height: 0 });
        bytes = new Uint8Array(await data.arrayBuffer());
      } catch (error) {
        if (isNotFound(error)) return ok(null);
        log.error(`logo download failed: ${errorLabel(error)}`, { clientId: target.clientId });
        return err({ code: "STORAGE_FAILED", message: "Could not check the upload." });
      }
      // Not a readable PNG, JPEG or WebP: the use case rejects it as an invalid logo.
      return ok(imageSize(bytes) ?? { format: null, width: 0, height: 0 });
    },

    async remove(target) {
      try {
        const { error } = await bucket().remove([keyOf(target)]);
        if (error) throw error;
        return ok(undefined);
      } catch (error) {
        log.error(`logo remove failed: ${errorLabel(error)}`, { clientId: target.clientId });
        return err({ code: "STORAGE_FAILED", message: "Could not delete the old logo." });
      }
    },
  };
}
