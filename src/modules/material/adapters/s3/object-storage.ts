import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import { assetKey } from "@/modules/material/adapters/asset-key";
import type { StorageConfig } from "@/shared/env";
import { log } from "@/shared/log";
import { err, ok } from "@/shared/result";

/** How long a presigned POST stays valid, in seconds. */
export const PRESIGNED_POST_TTL_SECONDS = 15 * 60;

/** The S3 calls this adapter makes; injectable so tests stub the network. */
export interface S3Calls {
  send: (command: HeadObjectCommand) => Promise<{ ContentLength?: number; ContentType?: string }>;
  presignPost: typeof createPresignedPost;
  presignGet: (client: S3Client, command: GetObjectCommand, options: { expiresIn: number }) => Promise<string>;
  client: S3Client;
}

/** The bucket's client. Only checksums S3 requires: a presigned POST cannot carry SDK-computed ones. */
export function createS3Client(region: string): S3Client {
  return new S3Client({ region, requestChecksumCalculation: "WHEN_REQUIRED" });
}

function defaultCalls(region: string): S3Calls {
  const client = createS3Client(region);
  return { client, send: (command) => client.send(command), presignPost: createPresignedPost, presignGet: (c, command, options) => getSignedUrl(c, command, options) };
}

const isNotFound = (error: unknown) => {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
};

/** S3 adapter for one bucket. Credentials come from the AWS SDK default chain. */
export function createS3ObjectStorage(config: StorageConfig, calls: S3Calls = defaultCalls(config.region)): ObjectStorage {
  return {
    async presignUpload(target, maxBytes) {
      const key = assetKey(target.caseId, target.assetId, target.contentType);
      try {
        const { url, fields } = await calls.presignPost(calls.client, {
          Bucket: config.bucket,
          Key: key,
          Fields: { "Content-Type": target.contentType },
          Conditions: [
            ["content-length-range", 1, maxBytes],
            ["eq", "$Content-Type", target.contentType],
          ],
          Expires: PRESIGNED_POST_TTL_SECONDS,
        });
        return ok({ url, fields });
      } catch (error) {
        log.error(`s3 presign failed: ${(error as Error)?.name ?? "unknown"}`, { caseId: target.caseId });
        return err({ code: "STORAGE_FAILED", message: "Could not prepare the upload." });
      }
    },

    async presignDownload(target, ttlSeconds) {
      const key = assetKey(target.caseId, target.assetId, target.contentType);
      try {
        const url = await calls.presignGet(calls.client, new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
          // Serve the validated type, shown inline, whatever metadata the object carries.
          ResponseContentType: target.contentType,
          ResponseContentDisposition: "inline",
        }), {
          expiresIn: ttlSeconds,
        });
        return ok(url);
      } catch (error) {
        log.error(`s3 presign get failed: ${(error as Error)?.name ?? "unknown"}`, { caseId: target.caseId });
        return err({ code: "STORAGE_FAILED", message: "Could not prepare the file link." });
      }
    },

    async head(target) {
      const key = assetKey(target.caseId, target.assetId, target.contentType);
      try {
        const out = await calls.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return ok({ sizeBytes: out.ContentLength ?? 0, contentType: out.ContentType ?? null });
      } catch (error) {
        if (isNotFound(error)) return ok(null);
        log.error(`s3 head failed: ${(error as Error)?.name ?? "unknown"}`, { caseId: target.caseId });
        return err({ code: "STORAGE_FAILED", message: "Could not check the upload." });
      }
    },
  };
}
