import { logoExtensionFor, type LogoContentType } from "@/modules/case-study/domain/case-study";

/**
 * The one place a client logo's storage key (object path in the `material` bucket)
 * is built: `clients/{clientId}/logos/{logoId}.{ext}` (AD-8). The extension comes
 * from the allowed content type, never from the file name.
 */
export function logoKey(clientId: string, logoId: string, contentType: LogoContentType): string {
  return `clients/${clientId}/logos/${logoId}.${logoExtensionFor(contentType)}`;
}
