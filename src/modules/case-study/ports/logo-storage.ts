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
 * Implemented by `adapters/supabase/logo-storage.ts`. Objects are never deleted.
 */
export interface LogoStorage {
  /** A signed upload URL that never overwrites an existing object. `err` only on failure. */
  presignUpload(target: LogoTarget): Promise<Result<PresignedLogoUpload>>;
  /** A signed GET valid `ttlSeconds` (at most 15 minutes). `err` only on failure. */
  presignDownload(target: LogoTarget, ttlSeconds: number): Promise<Result<string>>;
  /** The object's stored metadata; `ok(null)` when it does not exist. */
  head(target: LogoTarget): Promise<Result<StoredLogo | null>>;
  /** The stored image's real format and pixel size; `ok(null)` when the object is missing. */
  dimensions(target: LogoTarget): Promise<Result<LogoImage | null>>;
}
