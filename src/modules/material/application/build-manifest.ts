import { createHash } from "node:crypto";
import type { AllowedContentType } from "@/modules/material/domain/files";
import { caseIdSchema, parseInput } from "@/modules/material/domain/validation";
import { ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * What a generation reads, recorded on the revision (Story 3.7): the case's non-deleted
 * assets, oldest first, with size and content type, and a sha256 of the details-form
 * values. A true per-file content hash waits for Story 3.6.
 */
export interface MaterialManifest {
  assets: { id: string; sizeBytes: number; contentType: AllowedContentType }[];
  formHash: string;
}

/**
 * The material manifest of a case, as it is now. Reads only (no storage, no signing).
 * Favourites are not part of it. Errors: `INVALID_INPUT`, `NOT_FOUND`,
 * `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`, and the form read's errors.
 */
export function makeBuildManifest({ assets, form, cases }: Pick<MaterialDeps, "assets" | "form" | "cases">) {
  return async function buildManifest(caseId: unknown): Promise<Result<MaterialManifest>> {
    const parsed = parseInput(caseIdSchema, caseId);
    if (!parsed.ok) return parsed;

    const found = await cases.get(parsed.value);
    if (!found.ok) return found;
    const live = await assets.listLive(parsed.value);
    if (!live.ok) return live;
    const values = await form.read(parsed.value);
    if (!values.ok) return values;

    const { context, solution, results, testimonialQuote, testimonialAuthor } = values.value;
    const formHash = createHash("sha256")
      .update(JSON.stringify({ context, solution, results, testimonialQuote, testimonialAuthor }))
      .digest("hex");
    return ok({
      assets: live.value.map((a) => ({ id: a.id, sizeBytes: a.sizeBytes, contentType: a.contentType })),
      formHash,
    });
  };
}
