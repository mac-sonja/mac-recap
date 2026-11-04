import { describe, expect, it } from "vitest";
import { assetKey, clientAssetKey, clientRenditionKey, renditionKey } from "./asset-key";

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";

describe("asset keys", () => {
  it("builds the original's key from the content type", () => {
    expect(assetKey(CASE_ID, ASSET_ID, "image/jpeg")).toBe(`cases/${CASE_ID}/assets/${ASSET_ID}/original.jpg`);
  });

  it("builds a rendition key next to the original", () => {
    expect(renditionKey(CASE_ID, ASSET_ID, "0123456789abcdef", "webp")).toBe(
      `cases/${CASE_ID}/assets/${ASSET_ID}/renditions/0123456789abcdef.webp`,
    );
    expect(renditionKey(CASE_ID, ASSET_ID, "0123456789abcdef", "mp4")).toBe(
      `cases/${CASE_ID}/assets/${ASSET_ID}/renditions/0123456789abcdef.mp4`,
    );
  });

  it.each(["", "0123", "../../original", "0123456789ABCDEF"])("refuses a malformed spec hash %j", (hash) => {
    expect(() => renditionKey(CASE_ID, ASSET_ID, hash, "webp")).toThrow();
  });

  it("builds a client file's original and rendition keys under the client's prefix (Story 4.5c-2)", () => {
    const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
    expect(clientAssetKey(CLIENT_ID, ASSET_ID, "video/quicktime")).toBe(`clients/${CLIENT_ID}/material/${ASSET_ID}.mov`);
    expect(clientRenditionKey(CLIENT_ID, ASSET_ID, "0123456789abcdef", "mp4")).toBe(
      `clients/${CLIENT_ID}/material/${ASSET_ID}/renditions/0123456789abcdef.mp4`,
    );
    expect(() => clientRenditionKey(CLIENT_ID, ASSET_ID, "../x", "webp")).toThrow();
  });
});
