import { CURRENT_SCHEMA_VERSION, type CaseStudyDocument, type DocumentMaterialRef } from "@/modules/generation/domain/document";
import { cite, excerpt, marked, type DraftText } from "@/modules/generation/application/test-draft";
import {
  CLIENT_TEMPLATE,
  CLIENT_TEMPLATE_TEXT_KEYS,
  FORMAT_IDS,
  starterPages,
  type ClientTemplateTextKey,
  type TemplateContext,
} from "@/modules/rendering";

/**
 * Story 3.11: a client's intro-and-outro document from the client template's default
 * pages (`mac-client@1`), filled with test text marked "[bozza di prova]". Pure: no I/O,
 * no LLM. Story 3.9 later builds the same document with the AI's texts. The client's
 * name, sector and results stay bindings (the template's); only the test texts quote the
 * client's own fields, each citing it as `{ kind: "client_field", id }`.
 */

/** The client fields the test texts quote. */
export interface ClientIntroDraftClient {
  description: string | null;
  /** The brief's Contesto. */
  context: string;
}

export interface ClientIntroDraftInput {
  client: ClientIntroDraftClient;
  /** The client's image asset ids in `position` order; the template shows the first three. */
  images: readonly string[];
  /** How many result rows the client has (0–3). */
  resultRows: number;
  /** Whether the client has a testimonial. */
  hasTestimonial: boolean;
  /** A fresh uuid for each block and element. */
  newId: () => string;
}

/** One text per client template key. */
export type ClientDraftTexts = Readonly<Record<ClientTemplateTextKey, DraftText>>;

/** Longest client field quoted in a body. */
const BODY_CHARS = 400;

const ref = (id: string): DocumentMaterialRef[] => [{ kind: "client_field", id }];

/**
 * The four test texts: the heads are fixed sentences citing the client's `name`; the
 * intro body quotes its `description` and the outro body the brief's Contesto, citing
 * them (a fixed sentence citing `name` when the field is empty). Each distinct.
 */
export function clientIntroTestTexts(client: ClientIntroDraftClient): Record<ClientTemplateTextKey, DraftText> {
  const fromField = (field: "description" | "context", label: string, fallback: string): DraftText => {
    const value = (field === "description" ? client.description : client.context) ?? "";
    return value.trim() === ""
      ? { text: marked(fallback), sourceRefs: ref("name") }
      : { text: marked(`${label}: ${excerpt(value, BODY_CHARS)}`), sourceRefs: ref(field) };
  };
  return {
    introHead: { text: marked("Chi è il cliente"), sourceRefs: ref("name") },
    introBody: fromField("description", "Il cliente in breve", "Qui va il cliente: chi è e di cosa si occupa."),
    outroHead: { text: marked("Cosa abbiamo costruito insieme"), sourceRefs: ref("name") },
    outroBody: fromField("context", "Il contesto in breve", "Qui va il contesto: da dove siamo partiti insieme al cliente."),
  };
}

/**
 * A v2 client intro document from the client template's default pages in every registry
 * format, filled with `texts` (each carrying its `sourceRefs`). Shared by the test text
 * (3.11) and, later, the AI's (3.9).
 */
export function buildClientIntroDocument(input: Omit<ClientIntroDraftInput, "client"> & { texts: ClientDraftTexts }): CaseStudyDocument {
  const byText = new Map(CLIENT_TEMPLATE_TEXT_KEYS.map((key) => [input.texts[key].text, input.texts[key]]));
  const ctx: TemplateContext = {
    newId: input.newId,
    texts: Object.fromEntries(CLIENT_TEMPLATE_TEXT_KEYS.map((key) => [key, input.texts[key].text])),
    images: input.images,
    resultRows: input.resultRows,
    hasTestimonial: input.hasTestimonial,
  };
  const formats = Object.fromEntries(
    FORMAT_IDS.map((formatId) => [
      formatId,
      {
        pages: starterPages(CLIENT_TEMPLATE, "client_intro", formatId, ctx).map((p) => ({
          ...p,
          blocks: p.blocks.map((b) => ({ ...b, elements: cite(b.elements, byText) })),
        })),
      },
    ]),
  );
  return { schemaVersion: CURRENT_SCHEMA_VERSION, kind: "client_intro", template: CLIENT_TEMPLATE, formats };
}

/** The test draft of a client's intro and outro (Story 3.11): every text marked "[bozza di prova]". */
export function buildClientIntroTestDraft(input: ClientIntroDraftInput): CaseStudyDocument {
  return buildClientIntroDocument({ ...input, texts: clientIntroTestTexts(input.client) });
}
