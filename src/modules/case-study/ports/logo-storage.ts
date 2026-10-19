import type { LogoContentType } from "@/modules/case-study/domain/case-study";
import type { Result } from "@/shared/result";

/** One logo object; the adapter derives the key from it (`adapters/logo-key.ts`). */
export interface LogoTarget {
  clientId: string;
  logoId: string;
  contentType: LogoContentType;
}

/** A browser-ready signed upload: send the raw file to `url` with `method` and every entry of `headers`. */
export interface PresignedLogoUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface StoredLogo {
  sizeBytes: number;
  contentType: string | null;
}

/** What the stored image really is, read from its bytes. */
export interface LogoImage {
  /** `png`, `jpeg` or `webp`, read from the header bytes; null when it isn't one of those. */
  format: string | null;
  width: number;
  height: number;
}

/**
 * Client logos in the private `material` bucket, under `clients/{clientId}/logos/`.
 * Implemented by `adapters/supabase/logo-storage.ts`. A replaced or removed logo's
 * object is deleted (client info is live, owner 2026-10-16).
 */
export interface LogoStorage {
  /** A signed upload URL that never overwrites an existing object. `err` only on failure. */
  presignUpload(target: LogoTarget): Promise<Result<PresignedLogoUpload>>;
  /** A signed GET valid `ttlSeconds` (at most 15 minutes). `err` only on failure. */
  presignDownload(target: LogoTarget, ttlSeconds: number): Promise<Result<string>>;
  /** The object's stored metadata; `ok(null)` when it does not exist. */
  head(target: LogoTarget): Promise<Result<StoredLogo | null>>;
  /**
   * The stored object's bytes, for the SVG safety scan; `ok(null)` when it is missing.
   * An object over `LOGO_MAX_BYTES` is not read: its bytes come back empty.
   */
  read(target: LogoTarget): Promise<Result<Uint8Array | null>>;
  /** The stored image's real format and pixel size (PNG, JPEG or WebP); `ok(null)` when the object is missing. */
  dimensions(target: LogoTarget): Promise<Result<LogoImage | null>>;
  /** Deletes the object; a missing object is fine. `err` only on failure. */
  remove(target: LogoTarget): Promise<Result<void>>;
}
