import { extensionFor, type AllowedContentType } from "@/modules/material/domain/files";

/**
 * The one place an asset's storage key (object path in the `material` bucket) is built: `cases/{caseId}/assets/{assetId}/original.{ext}`.
 * The extension comes from the allowlisted content type, never from the file name.
 */
export function assetKey(caseId: string, assetId: string, contentType: AllowedContentType): string {
  return `cases/${caseId}/assets/${assetId}/original.${extensionFor(contentType)}`;
}
