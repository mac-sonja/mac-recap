import type { CaseStudyDocument, CaseStudyDocumentV0, FormatEntry } from "@/modules/generation/domain/document";

/**
 * Reference documents for tests (unit and DB). Plain data: no client value
 * anywhere. Each takes the format ids to key `formats` by (the registry's
 * `FORMAT_IDS`; domain code may not import the registry itself).
 */

const ASSET_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET_B = "aaaaaaaa-0000-4000-8000-000000000002";

const entry = (variant: string): FormatEntry => ({
  variant,
  slots: { hero: ASSET_A, detail: ASSET_B, extra: null },
  spacing: "regular",
  textScale: 1,
  fontPairing: "default",
});

const fixtureFormats = (formatIds: readonly string[]): Record<string, FormatEntry> =>
  Object.fromEntries(formatIds.map((id) => [id, entry(`${id}-two-media`)]));

const block = (n: number, section: string, text: string): CaseStudyDocument["blocks"][number] => ({
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
export function caseHistoryV1(formatIds: readonly string[]): CaseStudyDocument {
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
export function clientIntroV1(formatIds: readonly string[]): CaseStudyDocument {
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
export function caseHistoryV0(formatIds: readonly string[]): CaseStudyDocumentV0 {
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
