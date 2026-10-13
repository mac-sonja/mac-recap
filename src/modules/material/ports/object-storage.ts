import type { AllowedContentType } from "@/modules/material/domain/files";
import type { Result } from "@/shared/result";

/** One upload target; the adapter derives the object key from it. */
export interface UploadTarget {
  caseId: string;
  assetId: string;
  contentType: AllowedContentType;
}

/** A browser-ready presigned POST: post `fields` plus the file to `url`. */
export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
}

export interface StoredObject {
  sizeBytes: number;
  contentType: string | null;
}

/** The private S3 bucket. Implemented by `adapters/s3/object-storage.ts`. */
export interface ObjectStorage {
  /**
   * A presigned POST that fixes `Content-Type` and limits the body to
   * 1..`maxBytes`. Signing never touches the network; `err` only on failure.
   */
  presignUpload(target: UploadTarget, maxBytes: number): Promise<Result<PresignedUpload>>;
  /**
   * A presigned GET for the stored object, valid `ttlSeconds`. Signing never
   * touches the network; `err` only on failure.
   */
  presignDownload(target: UploadTarget, ttlSeconds: number): Promise<Result<string>>;
  /** HEAD of the uploaded object; `ok(null)` when it does not exist. */
  head(target: UploadTarget): Promise<Result<StoredObject | null>>;
}
