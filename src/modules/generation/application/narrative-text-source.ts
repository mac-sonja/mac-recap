import { z } from "zod";
import type { DraftText, DraftTexts, FormatDraftTexts } from "@/modules/generation/application/test-draft";
import { base64Size, requestDocuments } from "@/modules/generation/application/request-documents";
import type { SourceAsset, TextSource, TextSourceError } from "@/modules/generation/application/text-source";
import { MAX_SOURCE_REFS, MAX_TEXT_CHARS, type DocumentMaterialRef } from "@/modules/generation/domain/document";
import type {
  DocumentReader,
  NarrativeGenerator,
  NarrativeRequest,
  NarrativeSourceRef,
  NarrativeText,
} from "@/modules/generation/ports/narrative-generator";
import { FORMAT_IDS, TEMPLATE_TEXT_KEYS, type FormatId, type TemplateTextKey } from "@/modules/rendering";
import { log } from "@/shared/log";
import { err, ok, type AppError, type Result } from "@/shared/result";

export { MAX_EXTRACTED_CHARS, MAX_PDF_PAGES, REQUEST_BUDGET_BYTES } from "@/modules/generation/application/request-documents";
/** The API's limit for one image (raw bytes before base64); a display copy over it is left out. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Images sent at most (owner, 2026-10-29). */
export const MAX_IMAGES = 20;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PLAIN_TEXT = new Set(["text/plain", "text/markdown"]);
const IMAGE_TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);
const CLIENT_FIELDS = new Set(["description", "industry", "context", "solution", "results"]);
const FORM_FIELDS = new Set(["context", "solution"]);

/** What the AI text source needs, injected (wired in `worker.ts`). */
export interface NarrativeSourceDeps {
  generator: NarrativeGenerator;
  documents: DocumentReader;
  readAssetBytes(input: { caseId: string; assetId: string; variant: "original" | "image.display" }): Promise<Result<{ bytes: Uint8Array; contentType: string }>>;
  getClientInfo(caseId: string): Promise<Result<{
    name: string;
    industry: { label: string } | null;
    description: string | null;
    brief: { context: string; solution: string; results: readonly { label: string; value: string }[] };
  }>>;
}


const fail = (code: Uppercase<string>, message: string, retryable: boolean): Result<never, TextSourceError> => err({ code, message, retryable });

/** Errors the job must not retry: the same request would fail the same way. */
const FINAL_CODES = new Set(["LLM_REFUSAL", "LLM_REQUEST_REJECTED"]);

const resultRowsSchema = z.array(z.object({ label: z.string(), value: z.string() }));

/** Favourites first, then oldest first (the assets come oldest first). */
const favouritesFirst = (assets: readonly SourceAsset[]) => [...assets.filter((a) => a.isFavourite), ...assets.filter((a) => !a.isFavourite)];

/**
 * Picks and reads the material the AI gets (Story 3.6; owner, 2026-10-29): DOCX, TXT and MD as
 * their text; PDFs whole, oldest first, while they fit the budget and the 200-page limit, else as
 * their extracted text; images as their display renditions, favourites first, at most 20, while
 * they fit; videos skipped. A file removed since, or an image whose display copy is not made
 * yet, is skipped and logged by id. Another read error fails the attempt (retryable).
 */
async function collectMaterial(
  deps: NarrativeSourceDeps,
  caseId: string,
  assets: readonly SourceAsset[],
): Promise<Result<Pick<NarrativeRequest, "documents" | "images">, TextSourceError>> {
  const docs = requestDocuments(deps.documents, { caseId });
  const images: NarrativeRequest["images"][number][] = [];

  const read = async (assetId: string, variant: "original" | "image.display") => {
    const got = await deps.readAssetBytes({ caseId, assetId, variant });
    if (got.ok) return { bytes: got.value.bytes, contentType: got.value.contentType, skip: false as const };
    if (got.error.code === "NOT_FOUND" || got.error.code === "RENDITION_NOT_READY") {
      log.warn(`generate skips a file (${got.error.code}) ${assetId}`, { caseId });
      return { skip: true as const };
    }
    return { error: got.error, skip: false as const };
  };

  // 1. Text documents always go.
  for (const asset of assets) {
    if (asset.contentType !== DOCX && !PLAIN_TEXT.has(asset.contentType)) continue;
    const got = await read(asset.id, "original");
    if (got.skip) continue;
    if ("error" in got) return fail("MATERIAL_READ_FAILED", "A file could not be read.", true);
    try {
      docs.addText(asset.id, asset.contentType === DOCX ? await deps.documents.docxText(got.bytes) : new TextDecoder().decode(got.bytes));
    } catch (error) {
      log.warn(`generate skips an unreadable document ${asset.id} (${error instanceof Error ? error.name : typeof error})`, { caseId });
    }
  }

  // 2. PDFs, oldest first, whole while they fit; otherwise their text (option A).
  for (const asset of assets) {
    if (asset.contentType !== "application/pdf") continue;
    const got = await read(asset.id, "original");
    if (got.skip) continue;
    if ("error" in got) return fail("MATERIAL_READ_FAILED", "A file could not be read.", true);
    await docs.addPdf(asset.id, got.bytes);
  }

  // 3. Images: favourites first, at most 20, while they fit.
  for (const asset of favouritesFirst(assets.filter((a) => a.kind === "image"))) {
    if (images.length >= MAX_IMAGES) break;
    const got = await read(asset.id, "image.display");
    if (got.skip) continue;
    if ("error" in got) return fail("MATERIAL_READ_FAILED", "A file could not be read.", true);
    const size = base64Size(got.bytes.byteLength);
    if (!IMAGE_TYPES.has(got.contentType) || got.bytes.byteLength > MAX_IMAGE_BYTES || size > docs.remaining()) {
      log.warn(`generate leaves out the image ${asset.id}: over the request budget or not a sendable type`, { caseId });
      continue;
    }
    docs.spend(size);
    images.push({ assetId: asset.id, mediaType: got.contentType as "image/webp" | "image/png" | "image/jpeg", bytes: got.bytes });
  }
  return ok({ documents: docs.documents, images });
}

/** Whether a ref names something the AI received (the manifest, the form, the client). */
function knownRef(ref: NarrativeSourceRef, assetIds: ReadonlySet<string>, hasClient: boolean): boolean {
  if (ref.kind === "asset") return assetIds.has(ref.id);
  if (ref.kind === "form_field") return FORM_FIELDS.has(ref.id);
  if (ref.kind === "client_field") return hasClient && CLIENT_FIELDS.has(ref.id);
  return false;
}

/** The document's refs of a text: assets and form fields, deduplicated (client fields are bindings, never material refs). */
function documentRefs(refs: readonly NarrativeSourceRef[]): DocumentMaterialRef[] {
  const seen = new Set<string>();
  const out: DocumentMaterialRef[] = [];
  for (const ref of refs) {
    if (ref.kind === "client_field") continue;
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: ref.kind, id: ref.id });
  }
  return out.slice(0, MAX_SOURCE_REFS);
}

/**
 * The AI's texts as one text per key and format. A key a format does not show takes the
 * Presentazione text (it never reaches a page). Errors: `INVALID_SOURCE_REF` (a ref to
 * something the AI did not receive), `LLM_OUTPUT_INVALID` (an empty or too-long text, a
 * missing Presentazione key).
 */
function toFormatTexts(
  texts: Record<FormatId, Partial<Record<TemplateTextKey, NarrativeText>>>,
  assetIds: ReadonlySet<string>,
  hasClient: boolean,
): Result<FormatDraftTexts, TextSourceError> {
  for (const formatId of FORMAT_IDS) {
    for (const t of Object.values(texts[formatId] ?? {})) {
      if (t === undefined) continue;
      if (t.sourceRefs.some((ref) => !knownRef(ref, assetIds, hasClient))) {
        return fail("INVALID_SOURCE_REF", "The AI cited material it was not given.", false);
      }
      if (t.text.trim() === "" || t.text.length > MAX_TEXT_CHARS) return fail("LLM_OUTPUT_INVALID", "The AI wrote an empty or too long text.", true);
    }
  }
  const fallback = texts.presentazione_16_9 ?? {};
  const out: Partial<Record<FormatId, DraftTexts>> = {};
  for (const formatId of FORMAT_IDS) {
    const byKey: Partial<Record<TemplateTextKey, DraftText>> = {};
    for (const key of TEMPLATE_TEXT_KEYS) {
      const t = texts[formatId]?.[key] ?? fallback[key];
      if (t === undefined) return fail("LLM_OUTPUT_INVALID", "The AI answer misses a text.", true);
      byKey[key] = { text: t.text.trim(), sourceRefs: documentRefs(t.sourceRefs), ...(t.aspect === undefined ? {} : { aspect: t.aspect }) };
    }
    out[formatId] = byKey as DraftTexts;
  }
  return ok(out as FormatDraftTexts);
}

/**
 * The AI text source (Story 3.6): reads the job's material, the details form and the client's
 * current info, asks the narrative generator for one text per format, and checks every cited
 * source. Failures keep the generator's code; refusals and rejected requests are final.
 */
export function makeNarrativeTextSource(deps: NarrativeSourceDeps): TextSource {
  return {
    async texts({ caseId, form, assets }) {
      const client = await deps.getClientInfo(caseId);
      if (!client.ok && client.error.code !== "NOT_FOUND") return fail("CLIENT_LOOKUP_FAILED", client.error.message, true);
      const material = await collectMaterial(deps, caseId, assets);
      if (!material.ok) return material;

      const rows = resultRowsSchema.safeParse(form.results);
      const request: NarrativeRequest = {
        locale: "it",
        form: { context: form.context, solution: form.solution, results: rows.success ? rows.data : [] },
        client: client.ok
          ? {
              name: client.value.name,
              industry: client.value.industry?.label ?? null,
              description: client.value.description,
              brief: { context: client.value.brief.context, solution: client.value.brief.solution, results: client.value.brief.results },
            }
          : null,
        ...material.value,
      };
      log.info(`generate asks the AI: ${request.documents.length} documents, ${request.images.length} images`, { caseId });

      const written = await deps.generator.write(request);
      if (!written.ok) {
        const e: AppError = written.error;
        return fail(e.code, e.message, !FINAL_CODES.has(e.code));
      }
      const texts = toFormatTexts(written.value.texts, new Set(assets.map((a) => a.id)), client.ok);
      if (!texts.ok) return texts;
      return ok({ texts: texts.value, meta: { model: written.value.model, fellBack: written.value.fellBack, promptVersion: written.value.promptVersion } });
    },
  };
}
