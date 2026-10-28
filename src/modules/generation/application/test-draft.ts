import {
  CURRENT_SCHEMA_VERSION,
  type Block,
  type CaseStudyDocument,
  type DocumentElement,
  type DocumentMaterialRef,
  type Page,
  type TextElement,
} from "@/modules/generation/domain/document";
import {
  CASE_TEMPLATE,
  FORMAT_IDS,
  layouts,
  starterPages,
  TEMPLATE_TEXT_KEYS,
  type FormatId,
  type TemplateContext,
  type TemplateTextKey,
} from "@/modules/rendering";

/**
 * Story 3.10: a case history document built from each format's starter pages
 * (Story 3.4), filled with marked test text, so the configurator has real drafts
 * before the AI generator (3.6, 3.7) exists. Pure: no I/O, no LLM. Story 3.7 reuses
 * `buildCaseDocument` with the AI's texts and refs.
 */

/** Every test text starts with this marker. */
export const TEST_DRAFT_MARKER = "[bozza di prova]";

/** The parts of the case's details form (Story 2.10, 2.21) the test draft reads. */
export interface TestDraftForm {
  context: string;
  solution: string;
  results: readonly unknown[];
  testimonialQuote: string;
}

export interface TestDraftInput {
  /** The case's non-deleted image asset ids, oldest first. */
  images: readonly string[];
  /** Every non-deleted asset id of the case, oldest first; the first is cited by the fixed test texts. */
  assetIds: readonly string[];
  form: TestDraftForm;
  /** A fresh uuid for each block and element. */
  newId: () => string;
}

/** A text of the document and the material it cites. */
export interface DraftText {
  text: string;
  sourceRefs: readonly DocumentMaterialRef[];
}

export interface CaseDocumentInput {
  /** One text per template key, each distinct (texts are matched to their refs by value). */
  texts: Readonly<Record<TemplateTextKey, DraftText>>;
  images: readonly string[];
  resultRows: number;
  hasTestimonial: boolean;
  newId: () => string;
}

const GREY = "#EDEDF0";
const WHITE = "#FFFFFF";

/** Longest form answer quoted in a head and in a body. */
const HEAD_CHARS = 80;
const BODY_CHARS = 600;

/** The answer on one line, cut at a word boundary to at most `max` characters. */
function excerpt(answer: string, max: number): string {
  const line = answer.replace(/\s+/g, " ").trim();
  // By code points, so a cut never splits a surrogate pair.
  const points = Array.from(line);
  if (points.length <= max) return line;
  const cut = points.slice(0, max - 1).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const marked = (words: string) => `${TEST_DRAFT_MARKER} ${words}`;

/** Fixed test sentences, one per key, used when there is no form answer to build from. */
const FIXED: Readonly<Record<TemplateTextKey, string>> = Object.freeze({
  title: "Titolo del progetto",
  subtitle: "Sottotitolo del progetto, una riga che riassume il lavoro.",
  challengeHead: "Titolo della sfida",
  challengeBody: "Qui va la sfida del cliente: il problema da risolvere e perché contava.",
  ideaHead: "Titolo dell'idea",
  ideaBody: "Qui va l'idea: come abbiamo affrontato la sfida e cosa abbiamo proposto.",
  outputHead: "Il deliverable",
  outputBody: "Qui va l'output: cosa abbiamo consegnato e come è stato usato.",
});

/** The test texts of a case: Sfida from `context`, Idea from `solution`, the rest fixed and citing the first asset. */
export function testDraftTexts(form: Pick<TestDraftForm, "context" | "solution">, assetIds: readonly string[]): Record<TemplateTextKey, DraftText> {
  const firstAsset: DocumentMaterialRef[] = assetIds.length > 0 ? [{ kind: "asset", id: assetIds[0] }] : [];
  const fixed = (key: TemplateTextKey): DraftText => ({ text: marked(FIXED[key]), sourceRefs: firstAsset });
  const fromForm = (field: "context" | "solution", head: TemplateTextKey, body: TemplateTextKey): Partial<Record<TemplateTextKey, DraftText>> => {
    const answer = form[field];
    if (answer.trim() === "") return { [head]: fixed(head), [body]: fixed(body) };
    const refs: DocumentMaterialRef[] = [{ kind: "form_field", id: field }];
    const label = field === "context" ? "Sfida" : "Idea";
    return {
      [head]: { text: marked(`${label}: ${excerpt(answer, HEAD_CHARS)}`), sourceRefs: refs },
      [body]: { text: marked(`${label} in breve: ${excerpt(answer, BODY_CHARS)}`), sourceRefs: refs },
    };
  };
  const built: Partial<Record<TemplateTextKey, DraftText>> = {
    ...fromForm("context", "challengeHead", "challengeBody"),
    ...fromForm("solution", "ideaHead", "ideaBody"),
  };
  return Object.fromEntries(TEMPLATE_TEXT_KEYS.map((key) => [key, built[key] ?? fixed(key)])) as Record<TemplateTextKey, DraftText>;
}

/**
 * The Carosello Contenuti page (the mockup's sample): three grey image blocks in
 * `three_a`, holding the case's first three images (`null` when it has fewer).
 */
function caroselloContent(images: readonly string[], newId: () => string): Page {
  const layout = layouts("carosello_1_1").find((l) => l.layoutId === "three_a");
  if (layout === undefined) throw new Error("mac-case@1 has no three_a layout in carosello_1_1");
  const blocks: Block[] = Array.from({ length: 3 }, (_, i) => ({
    blockId: newId(),
    name: "Immagine",
    background: { kind: "colour", value: GREY },
    elements: [{ elementId: newId(), type: "image", assetId: images[i] ?? null, fit: "fill" }],
  }));
  return {
    pageKey: "content",
    name: "Contenuti",
    role: "body",
    section: "output",
    background: { kind: "colour", value: WHITE },
    grid: { layoutId: layout.layoutId, rows: [...layout.rows], cols: [...layout.cols] },
    margin: 24,
    blocks,
  };
}

/** The pages of one format: its starter pages, and in Carosello the Contenuti page after the intro pages. */
function formatPages(formatId: FormatId, ctx: TemplateContext): Page[] {
  const pages = starterPages(CASE_TEMPLATE, "case_history", formatId, ctx);
  if (formatId !== "carosello_1_1") return pages;
  const afterIntro = pages.findLastIndex((p) => p.section === "intro") + 1;
  return [...pages.slice(0, afterIntro), caroselloContent(ctx.images, ctx.newId), ...pages.slice(afterIntro)];
}

/** Sets `sourceRefs` on every text whose words are one of the document's texts (fixed template copy is left as is). */
function cite(elements: readonly DocumentElement[], refsByText: ReadonlyMap<string, readonly DocumentMaterialRef[]>): DocumentElement[] {
  const citeText = (el: TextElement): TextElement => {
    const refs = el.text === undefined ? undefined : refsByText.get(el.text);
    return refs === undefined || refs.length === 0 ? el : { ...el, sourceRefs: [...refs] };
  };
  return elements.map((el) => {
    if (el.type === "text") return citeText(el);
    if (el.type === "text_group") return { ...el, items: el.items.map(citeText) };
    if (el.type === "row") {
      return {
        ...el,
        items: el.items.map((item) =>
          item.type === "text" ? citeText(item) : item.type === "text_group" ? { ...item, items: item.items.map(citeText) } : item,
        ),
      };
    }
    return el;
  });
}

/**
 * A v2 case history document from the template's starter pages, filled with `texts`
 * (each carrying its `sourceRefs`). Client and case values stay bindings. Shared by
 * the test draft (3.10) and, later, the generator (3.7).
 */
export function buildCaseDocument(input: CaseDocumentInput): CaseStudyDocument {
  const ctx: TemplateContext = {
    newId: input.newId,
    texts: Object.fromEntries(TEMPLATE_TEXT_KEYS.map((key) => [key, input.texts[key].text])),
    images: input.images,
    resultRows: input.resultRows,
    hasTestimonial: input.hasTestimonial,
  };
  const refsByText = new Map(TEMPLATE_TEXT_KEYS.map((key) => [input.texts[key].text, input.texts[key].sourceRefs]));
  const formats = Object.fromEntries(
    FORMAT_IDS.map((formatId) => [
      formatId,
      { pages: formatPages(formatId, ctx).map((p) => ({ ...p, blocks: p.blocks.map((b) => ({ ...b, elements: cite(b.elements, refsByText) })) })) },
    ]),
  );
  return { schemaVersion: CURRENT_SCHEMA_VERSION, kind: "case_history", template: CASE_TEMPLATE, formats };
}

/**
 * The test draft of a case (Story 3.10): every template text is a distinct test text
 * marked "[bozza di prova]", citing the form answer it is built from or the case's
 * first asset. No Risultati e testimonial page without result rows and testimonial.
 */
export function buildTestDraft(input: TestDraftInput): CaseStudyDocument {
  return buildCaseDocument({
    texts: testDraftTexts(input.form, input.assetIds),
    images: input.images,
    resultRows: input.form.results.length,
    hasTestimonial: input.form.testimonialQuote.trim() !== "",
    newId: input.newId,
  });
}
