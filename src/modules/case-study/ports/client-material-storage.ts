import type { ClientMaterialContentType } from "@/modules/case-study/domain/client-material";
import type { LogoImage, PresignedLogoUpload, StoredLogo } from "@/modules/case-study/ports/logo-storage";
import type { Result } from "@/shared/result";

/** One client file object; the adapter derives the key from it (`adapters/client-material-key.ts`). */
export interface ClientMaterialTarget {
  clientId: string;
  assetId: string;
  contentType: ClientMaterialContentType;
}

/** A browser-ready signed upload: send the raw file to `url` with `method` and every entry of `headers`. */
export type PresignedClientMaterialUpload = PresignedLogoUpload;

/** The object's stored metadata. */
export type StoredClientMaterial = StoredLogo;

/** What a stored image really is, read from its bytes. */
export type ClientMaterialImage = LogoImage;

/**
 * Client files in the private `material` bucket, under `clients/{clientId}/material/`.
 * Implemented by `adapters/supabase/client-material-storage.ts`. A removed file's
 * object is deleted.
 */
export interface ClientMaterialStorage {
  /** A signed upload URL that never overwrites an existing object. `err` only on failure. */
  presignUpload(target: ClientMaterialTarget): Promise<Result<PresignedClientMaterialUpload>>;
  /**
   * Signed GETs valid `ttlSeconds` (at most 15 minutes), in one storage call, in the
   * order of `targets`; an entry is `null` when that object could not be signed.
   * `err` only when the whole call fails.
   */
  presignDownloads(targets: readonly ClientMaterialTarget[], ttlSeconds: number): Promise<Result<(string | null)[]>>;
  /** The object's stored metadata; `ok(null)` when it does not exist. */
  head(target: ClientMaterialTarget): Promise<Result<StoredClientMaterial | null>>;
  /** The stored image's real format and pixel size (the whole object is read); `ok(null)` when the object is missing. */
  dimensions(target: ClientMaterialTarget): Promise<Result<ClientMaterialImage | null>>;
  /** Deletes the object; a missing object is fine. `err` only on failure. */
  remove(target: ClientMaterialTarget): Promise<Result<void>>;
}
