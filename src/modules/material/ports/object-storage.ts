import type { AllowedContentType } from "@/modules/material/domain/files";
import type { Result } from "@/shared/result";

/** One upload target; the adapter derives the object key from it. */
export interface UploadTarget {
  caseId: string;
  assetId: string;
  contentType: AllowedContentType;
}

/** A browser-ready signed upload: send the raw file to `url` with `method` and every entry of `headers`. */
export interface PresignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface StoredObject {
  sizeBytes: number;
  contentType: string | null;
}

/**
 * The private Supabase Storage bucket `material`. Implemented by
 * `adapters/supabase/object-storage.ts`. A signed upload URL binds only the
 * object path: the per-file checks are the bucket's own limits (size and the
 * content-type allowlist, enforced by Supabase on every upload) and the confirm
 * check of size and type from the object's stored metadata (`head`).
 */
export interface ObjectStorage {
  /**
   * A signed upload URL for the object's path that never overwrites an existing
   * object; the returned headers declare the content type the browser must send.
   * `maxBytes` is informational only: the bucket's `file_size_limit` is the only
   * upload-time size cap, and confirm re-checks the stored size. `err` only on failure.
   */
  presignUpload(target: UploadTarget, maxBytes: number): Promise<Result<PresignedUpload>>;
  /** A signed GET for the stored object, valid `ttlSeconds`, shown inline. `err` only on failure. */
  presignDownload(target: UploadTarget, ttlSeconds: number): Promise<Result<string>>;
  /**
   * Signed GETs for several objects in one storage call, valid `ttlSeconds`, in
   * the order of `targets`; an entry is `null` when that object could not be
   * signed (e.g. missing). `err` only when the whole call fails.
   */
  presignDownloads(targets: readonly UploadTarget[], ttlSeconds: number): Promise<Result<(string | null)[]>>;
  /** The uploaded object's stored metadata; `ok(null)` when it does not exist. */
  head(target: UploadTarget): Promise<Result<StoredObject | null>>;
  /**
   * Signed GETs for objects by stored key (rendition paths), valid `ttlSeconds`,
   * in the order of `keys`; `null` for a key that could not be signed. `err`
   * only when the whole call fails. Never builds a key itself.
   */
  presignKeys(keys: readonly string[], ttlSeconds: number): Promise<Result<(string | null)[]>>;
  /**
   * Worker only: the object's bytes. `ok(null)` when it does not exist; `err
   * STORAGE_FAILED` on any other failure. Reads only.
   */
  download(key: string): Promise<Result<Uint8Array | null>>;
  /**
   * Worker only: stores `bytes` at `key` with `contentType`, replacing an
   * object already there (a retried rendition). Used only for rendition keys;
   * an original is never written through it. `err STORAGE_FAILED` on failure.
   */
  upload(key: string, bytes: Uint8Array, contentType: string): Promise<Result<void>>;
}
