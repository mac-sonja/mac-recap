import { extensionFor, type AllowedContentType } from "@/modules/material/domain/files";

/**
 * The one place an asset's storage key (object path in the `material` bucket) is built: `cases/{caseId}/assets/{assetId}/original.{ext}`.
 * The extension comes from the allowlisted content type, never from the file name.
 */
export function assetKey(caseId: string, assetId: string, contentType: AllowedContentType): string {
  return `cases/${caseId}/assets/${assetId}/original.${extensionFor(contentType)}`;
}

/**
 * The one place a rendition's storage key is built:
 * `cases/{caseId}/assets/{assetId}/renditions/{specHash}.{ext}` (Story 3.2), next to the original.
 */
export function renditionKey(caseId: string, assetId: string, specHash: string, ext: "webp" | "mp4"): string {
  if (!/^[0-9a-f]{16}$/.test(specHash)) throw new Error("renditionKey: specHash must be 16 lowercase hex characters");
  return `cases/${caseId}/assets/${assetId}/renditions/${specHash}.${ext}`;
}

/**
 * A client file's original, as the case-study module stores it:
 * `clients/{clientId}/material/{assetId}.{ext}` (case-study's `clientMaterialKey`;
 * `test/client-material-types.test.ts` keeps both equal). Only read through it: by the rendition
 * worker and by `readClientFileBytes` (the generate job, Story 3.9).
 */
export function clientAssetKey(clientId: string, assetId: string, contentType: AllowedContentType): string {
  return `clients/${clientId}/material/${assetId}.${extensionFor(contentType)}`;
}

/**
 * The one place a client file's rendition key is built (Story 4.5c-2):
 * `clients/{clientId}/material/{assetId}/renditions/{specHash}.{ext}`, under the client's
 * prefix next to the original. `upsert_client_rendition` checks exactly this path.
 */
export function clientRenditionKey(clientId: string, assetId: string, specHash: string, ext: "webp" | "mp4"): string {
  if (!/^[0-9a-f]{16}$/.test(specHash)) throw new Error("clientRenditionKey: specHash must be 16 lowercase hex characters");
  return `clients/${clientId}/material/${assetId}/renditions/${specHash}.${ext}`;
}
