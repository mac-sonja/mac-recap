import { z } from "zod";
import type { AllowedContentType } from "@/modules/material/domain/files";
import { parseInput } from "@/modules/material/domain/validation";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import { err, ok, type Result } from "@/shared/result";
import type { ClientFiles } from "./client-renditions";
import { storageNotConfigured } from "./deps";

const readInputSchema = z.object({ clientId: z.uuid(), assetId: z.uuid() });

/**
 * The original bytes of one live client file (Story 3.9, worker only: the generate job sends a
 * client's PDFs to the AI). Reads only. Errors: `INVALID_INPUT`, `NOT_FOUND` (an unknown or
 * removed file, another client's or a deleted client's file, or a missing object),
 * `STORAGE_NOT_CONFIGURED`, `CLIENT_LOOKUP_FAILED` and `CLIENT_INVALID` (the file lookup),
 * `STORAGE_FAILED` (the download).
 */
export function makeReadClientFileBytes(
  { files, storage }: { files: ClientFiles; storage: Pick<ObjectStorage, "download"> | null },
  originalKey: (file: { clientId: string; id: string; contentType: AllowedContentType }) => string,
) {
  return async function readClientFileBytes(input: unknown): Promise<Result<{ bytes: Uint8Array; contentType: string }>> {
    const parsed = parseInput(readInputSchema, input);
    if (!parsed.ok) return parsed;
    const clientId = parsed.value.clientId.toLowerCase();
    const assetId = parsed.value.assetId.toLowerCase();
    if (storage === null) return storageNotConfigured();
    const notFound = () => err({ code: "NOT_FOUND", message: "No such file.", details: { assetId } });

    const found = await files.get(assetId);
    if (!found.ok) return found;
    const file = found.value;
    if (file === null || file.deletedAt !== null || file.clientId.toLowerCase() !== clientId) return notFound();

    const downloaded = await storage.download(originalKey(file));
    if (!downloaded.ok) return downloaded;
    if (downloaded.value === null) return notFound();
    return ok({ bytes: downloaded.value, contentType: file.contentType });
  };
}
