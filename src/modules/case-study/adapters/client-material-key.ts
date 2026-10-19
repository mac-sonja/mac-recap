import { clientMaterialExtensionFor, type ClientMaterialContentType } from "@/modules/case-study/domain/client-material";

/**
 * The one place a client file's storage key (object path in the `material` bucket)
 * is built: `clients/{clientId}/material/{assetId}.{ext}` (AD-8). The extension
 * comes from the allowed content type, never from the file name.
 */
export function clientMaterialKey(clientId: string, assetId: string, contentType: ClientMaterialContentType): string {
  return `clients/${clientId}/material/${assetId}.${clientMaterialExtensionFor(contentType)}`;
}
