import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createS3Client, createS3ObjectStorage, PRESIGNED_POST_TTL_SECONDS, type S3Calls } from "./object-storage";

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const config = { bucket: "mac-recap-test", region: "eu-south-1" };
const target = { caseId: CASE_ID, assetId: ASSET_ID, contentType: "video/quicktime" as const };
const KEY = `cases/${CASE_ID}/assets/${ASSET_ID}/original.mov`;

function stubCalls() {
  const send = vi.fn<S3Calls["send"]>(async () => ({ ContentLength: 42, ContentType: "video/quicktime" }));
  const presignPost = vi.fn<S3Calls["presignPost"]>(async () => ({ url: "https://s3.example/", fields: { key: KEY } }));
  const presignGet = vi.fn<S3Calls["presignGet"]>(async () => "https://s3.example/signed-get");
  return { send, presignPost, presignGet, client: {} as S3Calls["client"] };
}

const quiet = () => vi.spyOn(process.stdout, "write").mockImplementation(() => true);

describe("createS3ObjectStorage", () => {
  it("presigns a POST that fixes the key, Content-Type and a 1..max length range", async () => {
    const calls = stubCalls();
    const result = await createS3ObjectStorage(config, calls).presignUpload(target, 100);
    expect(result).toEqual({ ok: true, value: { url: "https://s3.example/", fields: { key: KEY } } });
    expect(calls.presignPost).toHaveBeenCalledWith(calls.client, {
      Bucket: "mac-recap-test",
      Key: KEY,
      Fields: { "Content-Type": "video/quicktime" },
      Conditions: [
        ["content-length-range", 1, 100],
        ["eq", "$Content-Type", "video/quicktime"],
      ],
      Expires: PRESIGNED_POST_TTL_SECONDS,
    });
  });

  it("returns STORAGE_FAILED when signing throws", async () => {
    const write = quiet();
    try {
      const calls = stubCalls();
      calls.presignPost.mockRejectedValueOnce(Object.assign(new Error("no creds"), { name: "CredentialsProviderError" }));
      const result = await createS3ObjectStorage(config, calls).presignUpload(target, 100);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("STORAGE_FAILED");
    } finally {
      write.mockRestore();
    }
  });

  it("HEADs the object at its key and returns size and type", async () => {
    const calls = stubCalls();
    expect(await createS3ObjectStorage(config, calls).head(target)).toEqual({
      ok: true,
      value: { sizeBytes: 42, contentType: "video/quicktime" },
    });
    const command = calls.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect(command.input).toEqual({ Bucket: "mac-recap-test", Key: KEY });
  });

  it.each([
    ["NotFound", { name: "NotFound" }],
    ["a 404 status", { name: "Unknown", $metadata: { httpStatusCode: 404 } }],
  ])("returns null for %s", async (_label, error) => {
    const calls = stubCalls();
    calls.send.mockRejectedValueOnce(error);
    expect(await createS3ObjectStorage(config, calls).head(target)).toEqual({ ok: true, value: null });
  });

  it("returns STORAGE_FAILED for any other HEAD error", async () => {
    const write = quiet();
    try {
      const calls = stubCalls();
      calls.send.mockRejectedValueOnce({ name: "AccessDenied", $metadata: { httpStatusCode: 403 } });
      const result = await createS3ObjectStorage(config, calls).head(target);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("STORAGE_FAILED");
    } finally {
      write.mockRestore();
    }
  });

  it("builds its client with requestChecksumCalculation WHEN_REQUIRED", async () => {
    const client = createS3Client("eu-south-1");
    expect(await client.config.requestChecksumCalculation()).toBe("WHEN_REQUIRED");
    expect(await client.config.region()).toBe("eu-south-1");
  });

  it("signs a real presigned POST offline with the WHEN_REQUIRED client", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { createPresignedPost } = await import("@aws-sdk/s3-presigned-post");
    const client = new S3Client({
      region: config.region,
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "test-secret" },
    });
    const storage = createS3ObjectStorage(config, { client, presignPost: createPresignedPost, presignGet: vi.fn(), send: vi.fn() });
    const result = await storage.presignUpload(target, 100 * 1024 * 1024);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fields).toMatchObject({ key: KEY, "Content-Type": "video/quicktime" });
    const policy = JSON.parse(Buffer.from(result.value.fields.Policy, "base64").toString("utf8"));
    expect(policy.conditions).toEqual(
      expect.arrayContaining([
        ["content-length-range", 1, 104857600],
        ["eq", "$Content-Type", "video/quicktime"],
        { bucket: "mac-recap-test" },
        { key: KEY },
      ]),
    );
  });
});

describe("createS3ObjectStorage presignDownload", () => {
  it("presigns a GET of the object at its key, valid for the given seconds", async () => {
    const calls = stubCalls();
    const result = await createS3ObjectStorage(config, calls).presignDownload(target, 900);
    expect(result).toEqual({ ok: true, value: "https://s3.example/signed-get" });
    expect(calls.presignGet).toHaveBeenCalledOnce();
    const [, command, options] = calls.presignGet.mock.calls[0];
    expect(command.input).toEqual({
      Bucket: "mac-recap-test",
      Key: KEY,
      ResponseContentType: "video/quicktime",
      ResponseContentDisposition: "inline",
    });
    expect(options).toEqual({ expiresIn: 900 });
  });

  it("returns STORAGE_FAILED when signing throws", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const calls = stubCalls();
      calls.presignGet.mockRejectedValueOnce(Object.assign(new Error("no creds"), { name: "CredentialsProviderError" }));
      const result = await createS3ObjectStorage(config, calls).presignDownload(target, 900);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("STORAGE_FAILED");
      expect(write).toHaveBeenCalledOnce();
      const line = String(write.mock.calls[0][0]);
      expect(JSON.parse(line)).toMatchObject({ level: "error", caseId: CASE_ID });
      expect(line).not.toContain(KEY);
      expect(line).not.toContain(ASSET_ID);
    } finally {
      write.mockRestore();
    }
  });

  it("signs a real presigned GET offline, expiring in 15 minutes", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = new S3Client({
      region: config.region,
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "test-secret" },
    });
    const storage = createS3ObjectStorage(config, {
      client,
      presignPost: vi.fn(),
      presignGet: (c, command, options) => getSignedUrl(c, command, options),
      send: vi.fn(),
    });
    const result = await storage.presignDownload(target, 15 * 60);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.value);
    expect(url.pathname).toContain(`/cases/${CASE_ID}/assets/${ASSET_ID}/original.mov`);
    expect(url.hostname).toContain("mac-recap-test");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("response-content-type")).toBe("video/quicktime");
    expect(url.searchParams.get("response-content-disposition")).toBe("inline");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});
