import type { ClientDraftTexts } from "@/modules/generation/application/client-intro-draft";
import { requestDocuments } from "@/modules/generation/application/request-documents";
import type { DraftText } from "@/modules/generation/application/test-draft";
import type { ClientTextSource, ClientTextSourceInput, TextSourceError } from "@/modules/generation/application/text-source";
import { MAX_SOURCE_REFS, MAX_TEXT_CHARS, type DocumentMaterialRef } from "@/modules/generation/domain/document";
import {
  CLIENT_INTRO_TEXT_LIMITS,
  type ClientIntroField,
  type ClientIntroRequest,
  type ClientIntroSourceRef,
  type ClientIntroText,
  type ClientIntroWriter,
} from "@/modules/generation/ports/client-intro-writer";
import type { DocumentReader } from "@/modules/generation/ports/narrative-generator";
import { CLIENT_TEMPLATE_TEXT_KEYS, type ClientTemplateTextKey } from "@/modules/rendering";
import { log } from "@/shared/log";
import { err, ok, type AppError, type Result } from "@/shared/result";

/** What the client AI text source needs, injected (wired in `worker.ts`). */
export interface ClientIntroSourceDeps {
  writer: ClientIntroWriter;
  documents: DocumentReader;
  /** The original bytes of one live client file. */
  readClientFileBytes(input: { clientId: string; assetId: string }): Promise<Result<{ bytes: Uint8Array; contentType: string }>>;
  /** Every client sector, `{ key, label }`: the client's sector is sent as its label. */
  listClientSectors(): Promise<Result<readonly { key: string; label: string }[]>>;
}

const fail = (code: Uppercase<string>, message: string, retryable: boolean): Result<never, TextSourceError> => err({ code, message, retryable });

/** Errors the job must not retry: the same request would fail the same way. */
const FINAL_CODES = new Set(["LLM_REFUSAL", "LLM_REQUEST_REJECTED"]);

const filled = (value: string | null) => value !== null && value.trim() !== "";

/**
 * The client's PDFs (OP 2 for clients: no images, videos or other files), by 3.6's case rules
 * (`requestDocuments`), oldest first (the files come in `position` order). A file removed
 * since is skipped and logged by id. Another read error fails the attempt (retryable).
 */
async function collectPdfs(deps: ClientIntroSourceDeps, input: ClientTextSourceInput): Promise<Result<ClientIntroRequest["documents"], TextSourceError>> {
  const { clientId } = input;
  const docs = requestDocuments(deps.documents, { clientId });
  for (const asset of input.assets) {
    if (asset.contentType !== "application/pdf") continue;
    const got = await deps.readClientFileBytes({ clientId, assetId: asset.id });
    if (!got.ok) {
      if (got.error.code === "NOT_FOUND") {
        log.warn(`generate skips a client file (NOT_FOUND) ${asset.id}`, { clientId });
        continue;
      }
      return fail("MATERIAL_READ_FAILED", "A client file could not be read.", true);
    }
    await docs.addPdf(asset.id, got.value.bytes);
  }
  return ok(docs.documents);
}

/** The client fields the request carries: a field left empty is not sent, so it cannot be cited. */
function sentFields(client: ClientIntroRequest["client"]): Set<ClientIntroField> {
  const fields = new Set<ClientIntroField>(["name"]);
  if (filled(client.industry)) fields.add("industry");
  if (filled(client.description)) fields.add("description");
  if (filled(client.brief.context)) fields.add("context");
  if (filled(client.brief.solution)) fields.add("solution");
  if (client.brief.results.length > 0) fields.add("results");
  if (client.brief.testimonial !== null) fields.add("testimonial");
  return fields;
}

/** Whether a ref names something the AI received: a client field it was sent, or a PDF it was sent. */
function knownRef(ref: ClientIntroSourceRef, fields: ReadonlySet<string>, assetIds: ReadonlySet<string>): boolean {
  if (ref.kind === "client_field") return fields.has(ref.id);
  if (ref.kind === "asset") return assetIds.has(ref.id);
  return false;
}

/** The document's refs of a text: client fields and PDFs, deduplicated (a client intro keeps its `client_field` refs). */
function documentRefs(refs: readonly ClientIntroSourceRef[]): DocumentMaterialRef[] {
  const seen = new Set<string>();
  const out: DocumentMaterialRef[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: ref.kind, id: ref.id });
  }
  return out.slice(0, MAX_SOURCE_REFS);
}

/**
 * The AI's four texts, checked. Errors: `INVALID_SOURCE_REF` (a ref to something the AI was not
 * sent; final), `LLM_OUTPUT_INVALID` (a missing, empty or too-long text; retryable).
 */
function toDraftTexts(
  texts: Partial<Record<ClientTemplateTextKey, ClientIntroText>>,
  fields: ReadonlySet<string>,
  assetIds: ReadonlySet<string>,
): Result<ClientDraftTexts, TextSourceError> {
  for (const t of Object.values(texts)) {
    if (t !== undefined && t.sourceRefs.some((ref) => !knownRef(ref, fields, assetIds))) {
      return fail("INVALID_SOURCE_REF", "The AI cited a source it was not given.", false);
    }
  }
  const out: Partial<Record<ClientTemplateTextKey, DraftText>> = {};
  for (const key of CLIENT_TEMPLATE_TEXT_KEYS) {
    const t = texts[key];
    if (t === undefined) return fail("LLM_OUTPUT_INVALID", "The AI answer misses a text.", true);
    const text = t.text.trim();
    const max = Math.min(CLIENT_INTRO_TEXT_LIMITS[key], MAX_TEXT_CHARS);
    if (text === "" || Array.from(text).length > max) return fail("LLM_OUTPUT_INVALID", "The AI wrote an empty or too long text.", true);
    out[key] = { text, sourceRefs: documentRefs(t.sourceRefs), ...(t.aspect === undefined ? {} : { aspect: t.aspect }) };
  }
  // Texts are matched to their refs by value on the pages: two equal texts would swap refs.
  const values = CLIENT_TEMPLATE_TEXT_KEYS.map((key) => out[key]?.text);
  if (new Set(values).size !== values.length) return fail("LLM_OUTPUT_INVALID", "The AI wrote two equal texts.", true);
  return ok(out as ClientDraftTexts);
}

/**
 * The client AI text source (Story 3.9): sends the client's current name, sector label,
 * description and brief, and its PDFs, to the client writer, and checks every cited source and
 * every length. The four texts are the same in every format. Failures keep the writer's code;
 * refusals and rejected requests are final. Logs ids, codes and sizes only.
 */
export function makeClientIntroTextSource(deps: ClientIntroSourceDeps): ClientTextSource {
  return {
    async texts(input) {
      const { clientId, client } = input;
      let industry: string | null = null;
      if (client.industry !== null) {
        const sectors = await deps.listClientSectors();
        if (!sectors.ok) return fail("CLIENT_LOOKUP_FAILED", sectors.error.message, true);
        industry = sectors.value.find((s) => s.key === client.industry)?.label ?? null;
        if (industry === null) log.warn("generate sends no sector: the client's sector key is not in the list", { clientId });
      }
      const documents = await collectPdfs(deps, input);
      if (!documents.ok) return documents;

      const { brief } = client;
      const request: ClientIntroRequest = {
        locale: "it",
        client: {
          name: client.name,
          industry,
          description: client.description,
          brief: {
            context: brief.context,
            solution: brief.solution,
            results: brief.results,
            testimonial: brief.testimonialQuote.trim() === "" ? null : { quote: brief.testimonialQuote, author: brief.testimonialAuthor },
          },
        },
        documents: documents.value,
      };
      log.info(`generate asks the AI for a client intro: ${request.documents.length} documents`, { clientId });

      const written = await deps.writer.write(request);
      if (!written.ok) {
        const e: AppError = written.error;
        return fail(e.code, e.message, !FINAL_CODES.has(e.code));
      }
      const texts = toDraftTexts(written.value.texts, sentFields(request.client), new Set(request.documents.map((d) => d.assetId)));
      if (!texts.ok) {
        log.warn(`generate refuses the AI's client texts: ${texts.error.code}`, { clientId });
        return texts;
      }
      return ok({ texts: texts.value, meta: { model: written.value.model, fellBack: written.value.fellBack, promptVersion: written.value.promptVersion } });
    },
  };
}
