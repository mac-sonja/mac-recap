// Test fixtures for the export use cases and handler (Story 5.3): one approved case
// with the reference v2 document, its client and details, and fakes for the reads.
// Only *.test.ts files import this file.
import { vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { CaseClientInfo, CaseStudy, CaseStudyRevision } from "@/modules/case-study";
import { caseHistoryV2, clientIntroV2, type CaseStudyDocument } from "@/modules/generation";
import type { DetailsForm } from "@/modules/material";
import type { CollectionEntry, CollectionSourceDeps, PackSourceDeps } from "@/modules/rendering/application/export-source";
import { FORMAT_IDS } from "@/modules/rendering/domain/formats";
import { CLIENT_TEMPLATE } from "@/modules/rendering/templates";
import { ok } from "@/shared/result";

export const CASE_ID = "cccccccc-0000-4000-8000-000000000001";
export const CLIENT_ID = "dddddddd-0000-4000-8000-000000000001";
export const REVISION_ID = "eeeeeeee-0000-4000-8000-000000000001";
/** A collection (Story 5.10b). */
export const COLLECTION_ID = "c0c0c0c0-0000-4000-8000-000000000001";
export const LOGO_ID = "ffffffff-0000-4000-8000-000000000001";
/** The reference document's two images: a case file here, and a client file. */
export const CASE_IMAGE = "aaaaaaaa-0000-4000-8000-000000000001";
export const CLIENT_IMAGE = "aaaaaaaa-0000-4000-8000-000000000002";

export const ACTOR: Actor = {
  id: "00000000-0000-4000-8000-0000000000e1",
  email: "giulia@menatcode.it",
  displayName: "Giulia Riva",
  role: "account_sales_social",
};

export const caseStudy = (over: Partial<CaseStudy> = {}): CaseStudy => ({
  id: CASE_ID,
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand Lumen",
  client: { id: CLIENT_ID, name: "Lumen Srl", code: "LUM" },
  year: 2026,
  locale: "it",
  businessLines: ["branding"],
  status: "approved",
  projectOrderRef: null,
  headRevisionId: REVISION_ID,
  approvedRevisionId: REVISION_ID,
  headVersion: 1,
  createdBy: ACTOR.id,
  createdAt: "2026-10-20T10:00:00Z",
  updatedAt: "2026-10-20T10:00:00Z",
  deletedAt: null,
  ...over,
});

export const revision = (over: Partial<CaseStudyRevision> = {}): CaseStudyRevision => {
  const doc = caseHistoryV2(FORMAT_IDS);
  return {
    id: REVISION_ID,
    caseId: CASE_ID,
    clientIntroId: null,
    status: "approved",
    version: 3,
    generatedDoc: doc,
    doc,
    manifest: {},
    model: null,
    fellBack: false,
    promptVersion: null,
    schemaVersion: 2,
    createdBy: ACTOR.id,
    createdAt: "2026-10-20T10:00:00Z",
    updatedAt: "2026-10-20T10:00:00Z",
    ...over,
  } as CaseStudyRevision;
};

export const clientInfo = (over: Partial<CaseClientInfo> = {}): CaseClientInfo => ({
  clientId: CLIENT_ID,
  name: "Lumen Srl",
  industry: { key: "lusso", label: "Lusso" },
  description: "Luci per la casa.",
  logoId: LOGO_ID,
  brief: { context: "", solution: "", results: [{ label: "negozi", value: "12" }], testimonialQuote: "", testimonialAuthor: "" },
  ...over,
});

export const detailsForm = (over: Partial<DetailsForm> = {}): DetailsForm => ({
  context: "",
  solution: "",
  results: [{ label: "visitatori", value: "1.800" }],
  testimonialQuote: "Un lavoro preciso.",
  testimonialAuthor: "Anna, CEO",
  ...over,
});

/**
 * The reads of an approved case, each a spy; `over` replaces single ones. Its client's pack
 * (Story 5.9a) holds that one case and no intro.
 */
export function sourceDeps(over: Partial<PackSourceDeps & CollectionSourceDeps> = {}) {
  return {
    getCase: vi.fn(async () => ok(caseStudy())),
    getLiveRevision: vi.fn(async () => ok<CaseStudyRevision | null>(revision())),
    getClientInfoForCase: vi.fn(async () => ok(clientInfo())),
    getDetailsForm: vi.fn(async () => ok(detailsForm())),
    getClient: vi.fn(async () => ok({ id: CLIENT_ID, code: "LUM", name: "Lumen Srl" })),
    getClientIntro: vi.fn(async () => ok<{ id: string } | null>(null)),
    listClientCasesInOrder: vi.fn(async () => ok<CaseStudy[]>([caseStudy()])),
    getCollection: vi.fn(async () => ok({ id: COLLECTION_ID, name: "Pitch moda", items: [{ caseId: CASE_ID, clientId: CLIENT_ID }] as readonly CollectionEntry[] })),
    ...over,
  } satisfies PackSourceDeps & CollectionSourceDeps;
}

// ---------------------------------------------------------------------------
// A client's pack (Story 5.9a): three approved cases A, B, C of the client above and its intro.
// ---------------------------------------------------------------------------

export const PACK_CASES = {
  A: "cccccccc-0000-4000-8000-00000000000a",
  B: "cccccccc-0000-4000-8000-00000000000b",
  C: "cccccccc-0000-4000-8000-00000000000c",
} as const;
export type PackCase = keyof typeof PACK_CASES;
/** Each case's approved revision. */
export const PACK_REVISIONS: Readonly<Record<PackCase, string>> = {
  A: "eeeeeeee-0000-4000-8000-00000000000a",
  B: "eeeeeeee-0000-4000-8000-00000000000b",
  C: "eeeeeeee-0000-4000-8000-00000000000c",
};
export const INTRO_ID = "bbbbbbbb-0000-4000-8000-000000000001";
export const INTRO_REVISION_ID = "eeeeeeee-0000-4000-8000-0000000000f1";

/** The client's intro document: one intro page and one closing page per format, in the client template. */
export function introDoc(): CaseStudyDocument {
  const doc = clientIntroV2(FORMAT_IDS);
  const formats = Object.fromEntries(
    Object.entries(doc.formats).map(([formatId, { pages }]) => [
      formatId,
      { pages: [...pages, { ...pages[0], pageKey: "closing", name: "Chiusura", role: "outro" as const, section: "risultati" }] },
    ]),
  );
  return { ...doc, template: CLIENT_TEMPLATE, formats } as CaseStudyDocument;
}

export const introRevision = (over: Partial<CaseStudyRevision> = {}): CaseStudyRevision =>
  revision({ id: INTRO_REVISION_ID, caseId: null, clientIntroId: INTRO_ID, doc: introDoc(), generatedDoc: introDoc(), ...over } as Partial<CaseStudyRevision>);

const PACK_YEARS: Readonly<Record<PackCase, number>> = { A: 2024, B: 2025, C: 2026 };

/** Each pack case's own details: results and a testimonial that name the case. */
export const packDetails = (key: PackCase): DetailsForm =>
  detailsForm({
    results: [
      { label: `visitatori ${key}`, value: `1${key}` },
      { label: `ordini ${key}`, value: `2${key}` },
    ],
    testimonialQuote: `Citazione del caso ${key}.`,
    testimonialAuthor: `Autore ${key}`,
  });

/**
 * A pack case's approved revision: the reference document, whose Carosello also ends with the
 * case's own Chiusura (`closing`), which a pack drops.
 */
export function packCaseRevision(key: PackCase): CaseStudyRevision {
  const base = revision({ id: PACK_REVISIONS[key], caseId: PACK_CASES[key] });
  const carosello = base.doc.formats.carosello_1_1.pages;
  const last = carosello[carosello.length - 1];
  const closing = { ...last, pageKey: "closing", name: "Chiusura", role: "outro" as const };
  const doc = { ...base.doc, formats: { ...base.doc.formats, carosello_1_1: { pages: [...carosello, closing] } } } as CaseStudyDocument;
  return { ...base, doc, generatedDoc: doc };
}

/**
 * The reads of client CLIENT_ID's pack: its approved cases in `order` (the client's order),
 * each with its own approved revision, and its intro approved or not (`intro`: `approved`,
 * `unapproved` (an intro with no approved revision) or `none`).
 */
export function packDeps(options: { order?: PackCase[]; intro?: "approved" | "unapproved" | "none" } = {}, over: Partial<PackSourceDeps & CollectionSourceDeps> = {}) {
  const order = options.order ?? ["C", "A", "B"];
  const intro = options.intro ?? "approved";
  const caseFor = (key: PackCase) =>
    caseStudy({
      id: PACK_CASES[key],
      code: `LUM-2026-0${key}`,
      name: `Caso ${key}`,
      year: PACK_YEARS[key],
      approvedRevisionId: PACK_REVISIONS[key],
      headRevisionId: PACK_REVISIONS[key],
    });
  const keyOf = (id: string) => (Object.keys(PACK_CASES) as PackCase[]).find((k) => PACK_CASES[k] === id.toLowerCase());
  return sourceDeps({
    getCase: vi.fn(async (id: string) => ok(caseFor(keyOf(id) ?? "A"))),
    getLiveRevision: vi.fn(async (subject: { kind: string; id: string }) => {
      if (subject.kind === "client_intro") return ok<CaseStudyRevision | null>(intro === "approved" ? introRevision() : null);
      const key = keyOf(subject.id);
      return ok<CaseStudyRevision | null>(key === undefined ? null : packCaseRevision(key));
    }),
    getDetailsForm: vi.fn(async ({ caseId }: { caseId: string }) => ok(packDetails(keyOf(caseId) ?? "A"))),
    getClientIntro: vi.fn(async () => ok<{ id: string } | null>(intro === "none" ? null : { id: INTRO_ID })),
    listClientCasesInOrder: vi.fn(async () => ok<CaseStudy[]>(order.map(caseFor))),
    ...over,
  });
}

// ---------------------------------------------------------------------------
// A collection (Story 5.10b): group 1 is client CLIENT_ID's cases A and B (with its intro),
// group 2 is another client's one case, X.
// ---------------------------------------------------------------------------

export const OTHER_CLIENT_ID = "dddddddd-0000-4000-8000-000000000002";
export const OTHER_LOGO_ID = "ffffffff-0000-4000-8000-000000000002";
export const OTHER_CASE_ID = "cccccccc-0000-4000-8000-0000000000aa";
export const OTHER_REVISION_ID = "eeeeeeee-0000-4000-8000-0000000000aa";
/** A collection's case: one of CLIENT_ID's pack cases, or the other client's X. */
export type CollectionCase = PackCase | "X";

export const collectionCaseId = (key: CollectionCase) => (key === "X" ? OTHER_CASE_ID : PACK_CASES[key]);
export const collectionRevisionId = (key: CollectionCase) => (key === "X" ? OTHER_REVISION_ID : PACK_REVISIONS[key]);

/**
 * The reads of collection COLLECTION_ID: its cases in `items` (default A, B, X), each with its
 * own approved revision unless listed in `unavailable`, CLIENT_ID's intro approved or not
 * (`intro`), and the collection's `name` (default "Pitch moda").
 */
export function collectionDeps(
  options: { items?: CollectionCase[]; intro?: "approved" | "unapproved" | "none"; unavailable?: CollectionCase[]; name?: string } = {},
  over: Partial<PackSourceDeps & CollectionSourceDeps> = {},
) {
  const items = options.items ?? ["A", "B", "X"];
  const unavailable = new Set(options.unavailable ?? []);
  const keyOf = (id: string): CollectionCase | undefined =>
    id.toLowerCase() === OTHER_CASE_ID ? "X" : (Object.keys(PACK_CASES) as PackCase[]).find((k) => PACK_CASES[k] === id.toLowerCase());
  const caseFor = (key: CollectionCase) =>
    key === "X"
      ? caseStudy({
          id: OTHER_CASE_ID,
          code: "ORO-2026-01",
          name: "Caso X",
          client: { id: OTHER_CLIENT_ID, name: "Oro Spa", code: "ORO" },
          approvedRevisionId: OTHER_REVISION_ID,
          headRevisionId: OTHER_REVISION_ID,
        })
      : caseStudy({ id: PACK_CASES[key], code: `LUM-2026-0${key}`, name: `Caso ${key}`, approvedRevisionId: PACK_REVISIONS[key], headRevisionId: PACK_REVISIONS[key] });
  const base = packDeps({ intro: options.intro ?? "approved" });
  const packLive = vi.mocked(base.getLiveRevision).getMockImplementation()!;
  return {
    ...base,
    getCase: vi.fn(async (id: string) => ok(caseFor(keyOf(id) ?? "A"))),
    getLiveRevision: vi.fn(async (subject: { kind: "case" | "client_intro"; id: string }) => {
      if (subject.kind === "client_intro") return packLive(subject);
      const key = keyOf(subject.id);
      if (key === undefined || unavailable.has(key)) return ok<CaseStudyRevision | null>(null);
      if (key === "X") return ok<CaseStudyRevision | null>(revision({ id: OTHER_REVISION_ID, caseId: OTHER_CASE_ID }));
      return ok<CaseStudyRevision | null>(packCaseRevision(key));
    }),
    getClientInfoForCase: vi.fn(async (caseId: string) =>
      ok(keyOf(caseId) === "X" ? clientInfo({ clientId: OTHER_CLIENT_ID, name: "Oro Spa", logoId: OTHER_LOGO_ID }) : clientInfo()),
    ),
    getDetailsForm: vi.fn(async ({ caseId }: { caseId: string }) => {
      const key = keyOf(caseId);
      return ok(key === undefined || key === "X" ? detailsForm() : packDetails(key));
    }),
    getClientIntro: vi.fn(async (clientId: string) =>
      ok<{ id: string } | null>(clientId.toLowerCase() === CLIENT_ID && (options.intro ?? "approved") !== "none" ? { id: INTRO_ID } : null),
    ),
    getCollection: vi.fn(async () =>
      ok({
        id: COLLECTION_ID,
        name: options.name ?? "Pitch moda",
        items: items.map((key): CollectionEntry => ({ caseId: collectionCaseId(key), clientId: key === "X" ? OTHER_CLIENT_ID : CLIENT_ID })),
      }),
    ),
    ...over,
  } satisfies PackSourceDeps & CollectionSourceDeps;
}
