import { StorageApiError } from "@supabase/supabase-js";
import { EXPORT_FILES, EXPORT_MAX_BYTES, type ExportRecordFormat } from "@/modules/rendering/domain/export";
import type { ExportStorage } from "@/modules/rendering/ports/export-storage";
import { log } from "@/shared/log";
import { err, ok } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

/** The private bucket created by `20261105140000_rendering_export.sql`. */
export const RENDERING_BUCKET = "rendering";

/** Signed GETs live at most this long (AD-8). */
export const MAX_DOWNLOAD_TTL_SECONDS = 15 * 60;

const HASH = /^[0-9a-f]{64}$/;

/**
 * The only place an export's key is built: `exports/{contentHash}/{format}.{pdf|zip}`, a
 * bundle's `exports/{contentHash}/bundle.zip` (Story 5.4).
 * Throws for a malformed hash (a bug: hashes come from `contentHash`).
 */
export function exportKey(contentHash: string, format: ExportRecordFormat): string {
  if (!HASH.test(contentHash)) throw new Error("export content hash must be 64 hex characters");
  return `exports/${contentHash}/${format}.${EXPORT_FILES[format].extension}`;
}

const EXPORT_KEY = /^exports\/[0-9a-f]{64}\/(presentazione_16_9\.pdf|carosello_1_1\.zip|bundle\.zip)$/;

function errorLabel(error: unknown): string {
  if (error instanceof StorageApiError) return String(error.status);
  return (error as Error | null)?.name ?? "unknown";
}

/**
 * Supabase Storage adapter for export files, through the service-role client (the
 * bucket has no policies, so no browser key can reach it). Logs carry no key.
 */
export function createSupabaseExportStorage(client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient): ExportStorage {
  let memo: ReturnType<typeof createSupabaseAdminClient> | undefined;
  const bucket = () => {
    memo ??= client();
    return memo.storage.from(RENDERING_BUCKET);
  };

  return {
    async upload({ contentHash, format }, bytes) {
      const key = exportKey(contentHash, format);
      try {
        const { error } = await bucket().upload(key, bytes, { contentType: EXPORT_FILES[format].contentType, upsert: true });
        if (error) throw error;
        return ok({ path: key });
      } catch (error) {
        log.error(`export upload failed: ${errorLabel(error)}`);
        return err({ code: "STORAGE_FAILED", message: "Could not store the file." });
      }
    },

    async read(path) {
      if (!EXPORT_KEY.test(path)) return err({ code: "STORAGE_FAILED", message: "Not an export file." });
      try {
        const { data, error } = await bucket().download(path);
        if (error) throw error;
        if (data.size > EXPORT_MAX_BYTES) throw new Error("export file too large");
        return ok(new Uint8Array(await data.arrayBuffer()));
      } catch (error) {
        log.error(`export read failed: ${errorLabel(error)}`);
        return err({ code: "STORAGE_FAILED", message: "Could not read the file." });
      }
    },

    async presignDownload(path, ttlSeconds, fileName) {
      if (!EXPORT_KEY.test(path)) return err({ code: "STORAGE_FAILED", message: "Not an export file." });
      try {
        const ttl = Math.min(Math.max(1, Math.trunc(ttlSeconds)), MAX_DOWNLOAD_TTL_SECONDS);
        const { data, error } = await bucket().createSignedUrl(path, ttl, { download: fileName });
        if (error) throw error;
        return ok(data.signedUrl);
      } catch (error) {
        log.error(`export presign failed: ${errorLabel(error)}`);
        return err({ code: "STORAGE_FAILED", message: "Could not prepare the file link." });
      }
    },
  };
}
