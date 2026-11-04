import { createHash } from "node:crypto";
import { contentHashInput, type ExportFormatId, type ExportPartContent } from "@/modules/rendering/domain/export";

/**
 * An export's content hash (Story 5.3): the sha256 (64 hex characters) of
 * `contentHashInput`. The same hash reuses the stored file; any change to a part's
 * revision, client info or bound case fields, to the parts' order or to the format
 * gives a new one, so the next export renders again.
 */
export function contentHash(parts: readonly ExportPartContent[], format: ExportFormatId): string {
  return createHash("sha256").update(contentHashInput(parts, format)).digest("hex");
}
