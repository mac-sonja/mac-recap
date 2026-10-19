import { clientMaterialKey } from "@/modules/case-study/adapters/client-material-key";
import { imageSize } from "@/modules/case-study/adapters/image-size";
import { CLIENT_MATERIAL_MAX_BYTES } from "@/modules/case-study/domain/client-material";
import type { ClientMaterialStorage, ClientMaterialTarget } from "@/modules/case-study/ports/client-material-storage";
import { log } from "@/shared/log";
import { err, ok } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";
import { errorLabel, isNotFound, LOGO_BUCKET, MAX_DOWNLOAD_TTL_SECONDS } from "./logo-storage";

/** Client files share the private `material` bucket under `clients/` (AD-8); no new bucket, no limit change. */
export const CLIENT_MATERIAL_BUCKET = LOGO_BUCKET;

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const keyOf = (target: ClientMaterialTarget) => clientMaterialKey(target.clientId, target.assetId, target.contentType);

/**
 * Supabase Storage adapter for client files, through the service-role client (the
 * bucket has no policies, so no browser key can reach it). Copied from the logo
 * adapter. A removed file's object is deleted. Errors are logged with the client id
 * only, never the key.
 */
export function createSupabaseClientMaterialStorage(client: () => AdminClient = createSupabaseAdminClient): ClientMaterialStorage {
  let memo: AdminClient | undefined;
  const bucket = () => {
    memo ??= client();
    return memo.storage.from(CLIENT_MATERIAL_BUCKET);
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
        log.error(`client material presign failed: ${errorLabel(error)}`, { clientId: target.clientId });
        return err({ code: "STORAGE_FAILED", message: "Could not prepare the upload." });
      }
    },

    async presignDownloads(targets, ttlSeconds) {
      if (targets.length === 0) return ok([]);
      const clientId = targets[0].clientId;
      const paths = targets.map(keyOf);
      try {
        const { data, error } = await bucket().createSignedUrls(paths, Math.min(ttlSeconds, MAX_DOWNLOAD_TTL_SECONDS));
        if (error) throw error;
        const byPath = new Map(data.filter((d) => d.path !== null && d.error === null).map((d) => [d.path, d.signedUrl]));
        const urls = paths.map((path) => byPath.get(path) ?? null);
        const unsigned = urls.filter((url) => url === null).length;
        if (unsigned > 0) log.warn(`client material presign gets: ${unsigned} of ${paths.length} not signed`, { clientId });
        return ok(urls);
      } catch (error) {
        log.error(`client material presign gets failed: ${errorLabel(error)}`, { clientId });
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
        log.error(`client material head failed: ${errorLabel(error)}`, { clientId: target.clientId });
        return err({ code: "STORAGE_FAILED", message: "Could not check the upload." });
      }
    },

    async dimensions(target) {
      let bytes: Uint8Array;
      try {
        const { data, error } = await bucket().download(keyOf(target));
        if (error) throw error;
        // `head` has already bounded the size; this is the backstop before reading the whole body.
        if (data.size > CLIENT_MATERIAL_MAX_BYTES) return ok({ format: null, width: 0, height: 0 });
        bytes = new Uint8Array(await data.arrayBuffer());
      } catch (error) {
        if (isNotFound(error)) return ok(null);
        log.error(`client material download failed: ${errorLabel(error)}`, { clientId: target.clientId });
        return err({ code: "STORAGE_FAILED", message: "Could not check the upload." });
      }
      // Not a readable PNG, JPEG or WebP: the use case rejects the upload.
      return ok(imageSize(bytes) ?? { format: null, width: 0, height: 0 });
    },

    async remove(target) {
      try {
        const { error } = await bucket().remove([keyOf(target)]);
        if (error) throw error;
        return ok(undefined);
      } catch (error) {
        log.error(`client material remove failed: ${errorLabel(error)}`, { clientId: target.clientId });
        return err({ code: "STORAGE_FAILED", message: "Could not delete the file." });
      }
    },
  };
}
