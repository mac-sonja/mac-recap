import { createHash } from "node:crypto";
import {
  bundleHashInput,
  contentHashInput,
  packHashInput,
  type ExportFormatId,
  type ExportPartContent,
  type PackClient,
} from "@/modules/rendering/domain/export";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * An export's content hash (Story 5.3): the sha256 (64 hex characters) of
 * `contentHashInput`. The same hash reuses the stored file; any change to a part's
 * revision, client info or bound case fields, to the parts' order or to the format
 * gives a new one, so the next export renders again.
 */
export function contentHash(parts: readonly ExportPartContent[], format: ExportFormatId): string {
  return sha256(contentHashInput(parts, format));
}

/**
 * A bundle's content hash (Story 5.4): the sha256 of `bundleHashInput`, its formats
 * (sorted) with their own content hashes, `EXPORT_RENDER_VERSION` and the names of the
 * files inside (they carry the case's code and name).
 */
export function bundleHash(formats: readonly { format: ExportFormatId; contentHash: string }[], entryNames: readonly string[]): string {
  return sha256(bundleHashInput(formats, entryNames));
}

/**
 * A client pack's content hash (Story 5.9a): the sha256 of `packHashInput`, the client and
 * every part (subject, approved revision, bound values) in the pack's order, and the format.
 */
export function packHash(client: PackClient, parts: readonly ExportPartContent[], format: ExportFormatId): string {
  return sha256(packHashInput(client, parts, format));
}
