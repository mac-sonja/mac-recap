import type {
  Block,
  CaseStudyDocument,
  CaseStudyDocumentV0,
  CaseStudyDocumentV1,
  FormatEntryV1,
  Page,
  TextElement,
} from "@/modules/generation/domain/document";

/**
 * Reference documents for tests (unit and DB). Plain data: no client value
 * anywhere. The v2 fixtures take the format ids to key `formats` by (the
 * registry's `FORMAT_IDS`; domain code may not import the registry itself). The
 * v1 and v0 fixtures are stored shapes that `upgrade` still reads, keyed by the
 * formats of their time.
 */

const ASSET_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET_B = "aaaaaaaa-0000-4000-8000-000000000002";

/** The format keys of v0 and v1 documents (the registry before C28). */
export const LEGACY_FORMAT_IDS = ["deck_16_9", "social_carousel_4_5", "pdf_a4"] as const;

// ---------------------------------------------------------------------------
// v2
// ---------------------------------------------------------------------------

const id = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const blockId = (n: number) => id("bbbbbbbb", n);
const elementId = (n: number) => id("eeeeeeee", n);

const GREY = { kind: "colour", value: "#EDEDF0" } as const;
const WHITE = { kind: "colour", value: "#FFFFFF" } as const;

const generated = (n: number, style: TextElement["style"], text: string, aspect: "technical" | "graphic" = "technical"): TextElement => ({
  elementId: elementId(n),
  type: "text",
  style,
  text,
  provenance: "generated",
  aspect,
  sourceRefs: [{ kind: "form_field", id: "context" }],
});

/** A case history's pages: an intro, a content page and a results page, using every element type. */
function casePages(): Page[] {
  const project: Block = {
    blockId: blockId(1),
    name: "Progetto",
    background: GREY,
    elements: [
      {
        elementId: elementId(1),
        type: "text_group",
        align: "split",
        splitAt: 1,
        items: [generated(2, "lab", "Progetto"), generated(3, "xl", "Il titolo del progetto.", "graphic")],
      },
    ],
  };
  const client: Block = {
    blockId: blockId(2),
    name: "Cliente",
    background: GREY,
    elements: [
      { elementId: elementId(4), type: "text", style: "title", binding: { record: "client", field: "name" }, provenance: "generated" },
      { elementId: elementId(5), type: "text", style: "sub", binding: { record: "client", field: "sector" }, provenance: "generated" },
      { elementId: elementId(6), type: "logos" },
      { elementId: elementId(7), type: "divider" },
      { elementId: elementId(8), type: "services" },
      { elementId: elementId(9), type: "text", style: "lab", binding: { record: "case", field: "year" }, provenance: "generated" },
    ],
  };
  const challenge: Block = {
    blockId: blockId(3),
    name: "Sfida",
    background: { kind: "transparent" },
    elements: [{ elementId: elementId(10), type: "text_group", align: "top", items: [generated(11, "title", "Sfida"), generated(12, "text", "La sfida.")] }],
  };
  const media: Block[] = [
    { blockId: blockId(4), name: "Immagine", background: GREY, elements: [{ elementId: elementId(13), type: "image", assetId: ASSET_A, fit: "fill" }] },
    {
      blockId: blockId(5),
      name: "Dettaglio",
      background: GREY,
      elements: [{ elementId: elementId(14), type: "image", assetId: ASSET_B, fit: "crop", crop: { x: 0.25, y: 0.75, zoom: 1.5 } }],
    },
    { blockId: blockId(6), name: "Video", background: GREY, elements: [{ elementId: elementId(15), type: "video", assetId: null, fit: "fit" }] },
    {
      blockId: blockId(7),
      name: "Animazione",
      background: { kind: "image", assetId: ASSET_B },
      elements: [{ elementId: elementId(16), type: "animation", animation: "carousel_04", assetIds: [ASSET_A, ASSET_B], fit: "fill", size: 105 }],
    },
  ];
  const results: Block[] = [
    {
      blockId: blockId(8),
      name: "Risultati",
      background: { kind: "colour", value: "#2977FF" },
      elements: [
        { ...generated(17, "text", "Visite al sito"), colour: "#FFFFFF" },
        { elementId: elementId(18), type: "divider" },
        { ...generated(19, "num", "+40%"), colour: "#DEFE56", size: 75 },
        // The case's typed result rows (Story 2.21), bound rather than copied.
        { elementId: elementId(22), type: "text", style: "text", binding: { record: "case", field: "resultLabel", index: 1 }, provenance: "generated" },
        { elementId: elementId(23), type: "text", style: "num", binding: { record: "case", field: "resultValue", index: 1 }, provenance: "generated" },
      ],
    },
    {
      blockId: blockId(9),
      name: "Voce del cliente",
      background: GREY,
      elements: [
        {
          elementId: elementId(20),
          type: "text",
          style: "quote",
          text: "Una collaborazione eccellente.",
          provenance: "human_edited",
          align: "centre",
          columns: 2,
          colour: "transparent",
        },
        { elementId: elementId(21), type: "text", style: "text", text: "Aggiunto a mano.", provenance: "human_added", align: "right", columns: 1 },
        { elementId: elementId(24), type: "text", style: "quote", binding: { record: "case", field: "testimonialQuote" }, provenance: "generated" },
        { elementId: elementId(25), type: "text", style: "lab", binding: { record: "case", field: "testimonialAuthor" }, provenance: "human_added" },
      ],
    },
  ];
  return [
    {
      pageKey: "intro",
      name: "Intro",
      role: "intro",
      section: "intro",
      background: WHITE,
      grid: { layoutId: "intro-3", rows: [1, 1], cols: [2, 1] },
      blocks: [project, client, challenge],
    },
    {
      pageKey: "contenuti-4",
      name: "Contenuti",
      role: "body",
      section: "output",
      background: { kind: "transparent" },
      grid: { layoutId: "contenuti-4", rows: [1, 1], cols: [1, 1] },
      blocks: media,
    },
    {
      pageKey: "risultati",
      name: "Risultati e testimonial",
      role: "outro",
      section: "risultati",
      background: { kind: "image", assetId: ASSET_A },
      grid: { layoutId: "risultati-2", rows: [1], cols: [1, 1] },
      blocks: results,
    },
  ];
}

/** A client intro's pages: one intro page bound to the client's fields. */
function clientPages(): Page[] {
  return [
    {
      pageKey: "intro",
      name: "Intro",
      role: "intro",
      section: "intro",
      background: WHITE,
      grid: { layoutId: "intro-2", rows: [1], cols: [1, 1] },
      blocks: [
        {
          blockId: blockId(1),
          name: "Cliente",
          background: GREY,
          elements: [
            { elementId: elementId(1), type: "text", style: "xl", binding: { record: "client", field: "name" }, provenance: "generated" },
            { elementId: elementId(2), type: "logos" },
            generated(3, "text", "Introduzione"),
            { elementId: elementId(5), type: "text", style: "text", binding: { record: "client", field: "description" }, provenance: "generated" },
            { elementId: elementId(6), type: "text", style: "num", binding: { record: "client", field: "resultValue", index: 0 }, provenance: "generated" },
          ],
        },
        { blockId: blockId(2), name: "Immagine", background: GREY, elements: [{ elementId: elementId(4), type: "image", assetId: ASSET_A, fit: "fit" }] },
      ],
    },
  ];
}

/**
 * A valid v2 case history: every format has an intro, a content and a results
 * page, using every element type. The same ids appear in each format, as
 * independent copies.
 */
export function caseHistoryV2(formatIds: readonly string[]): CaseStudyDocument {
  return {
    schemaVersion: 2,
    kind: "case_history",
    template: "mac-case@1",
    formats: Object.fromEntries(formatIds.map((formatId) => [formatId, { pages: casePages() }])),
  };
}

/** A valid v2 client intro. */
export function clientIntroV2(formatIds: readonly string[]): CaseStudyDocument {
  return {
    schemaVersion: 2,
    kind: "client_intro",
    template: "mac-intro@1",
    formats: Object.fromEntries(formatIds.map((formatId) => [formatId, { pages: clientPages() }])),
  };
}

// ---------------------------------------------------------------------------
// v1 and v0 (stored shapes read through `upgrade`)
// ---------------------------------------------------------------------------

const entry = (variant: string): FormatEntryV1 => ({
  variant,
  slots: { hero: ASSET_A, detail: ASSET_B, extra: null },
  spacing: "regular",
  textScale: 1,
  fontPairing: "default",
});

const fixtureFormats = (formatIds: readonly string[]): Record<string, FormatEntryV1> =>
  Object.fromEntries(formatIds.map((id) => [id, entry(`${id}-two-media`)]));

const block = (n: number, section: string, text: string): CaseStudyDocumentV1["blocks"][number] => ({
  blockId: `bbbbbbbb-0000-4000-8000-00000000000${n}`,
  section,
  text,
  claims: [
    {
      claimId: `cccccccc-0000-4000-8000-00000000000${n}`,
      text,
      aspect: n % 2 === 0 ? "graphic" : "technical",
      provenance: "generated",
      sourceRefs: [{ kind: "form_field", id: "context" }],
    },
  ],
  check: null,
});

/** A valid v1 case history: challenge, approach, result, then a title. */
export function caseHistoryV1(formatIds: readonly string[] = LEGACY_FORMAT_IDS): CaseStudyDocumentV1 {
  return {
    schemaVersion: 1,
    kind: "case_history",
    template: "mac-case@1",
    blocks: [
      block(1, "challenge", "La sfida."),
      block(2, "approach", "L'approccio."),
      block(3, "result", "Il risultato."),
      block(4, "title", "Titolo"),
    ],
    selectedMedia: [ASSET_A, ASSET_B],
    formats: fixtureFormats(formatIds),
  };
}

/** A valid v1 client intro: no narrative sections required. */
export function clientIntroV1(formatIds: readonly string[] = LEGACY_FORMAT_IDS): CaseStudyDocumentV1 {
  return {
    schemaVersion: 1,
    kind: "client_intro",
    template: "mac-intro@1",
    blocks: [block(1, "title", "Introduzione")],
    selectedMedia: [ASSET_A, ASSET_B],
    formats: fixtureFormats(formatIds),
  };
}

/** A stored v0 case history (the pre-release shape `upgrade` still reads). */
export function caseHistoryV0(formatIds: readonly string[] = LEGACY_FORMAT_IDS): CaseStudyDocumentV0 {
  return {
    schemaVersion: 0,
    kind: "case_history",
    templateId: "mac-case",
    templateVersion: 1,
    blocks: [
      { id: "bbbbbbbb-0000-4000-8000-000000000001", section: "challenge", text: "La sfida.", claims: [{ claimId: "cccccccc-0000-4000-8000-000000000001", text: "La sfida.", aspect: "technical" }] },
      { id: "bbbbbbbb-0000-4000-8000-000000000002", section: "approach", text: "L'approccio.", claims: [] },
      {
        id: "bbbbbbbb-0000-4000-8000-000000000003",
        section: "result",
        text: "Il risultato.",
        claims: [
          {
            claimId: "cccccccc-0000-4000-8000-000000000003",
            text: "Il risultato.",
            aspect: "graphic",
            sourceRefs: [{ kind: "asset", id: ASSET_A }],
          },
        ],
      },
    ],
    media: [ASSET_A, ASSET_B],
    formats: fixtureFormats(formatIds),
  };
}
