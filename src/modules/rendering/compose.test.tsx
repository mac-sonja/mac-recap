// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CaseStudyDocument, Page } from "@/modules/generation";
import {
  CASE_TEMPLATE,
  composeParts,
  FORMAT_IDS,
  renderComposed,
  starterPages,
  TEMPLATE_TEXT_KEYS,
  type BoundValues,
  type CasePart,
  type ClientIntroPart,
  type ComposedFile,
  type FormatId,
} from "@/modules/rendering";

const idFactory = (prefix: string) => {
  let n = 0;
  return () => `${prefix}-0000-4000-8000-${String(++n).padStart(12, "0")}`;
};

const VALUES: BoundValues = {
  client: { name: "Lumen", sector: "Illuminazione", description: "", logoUrl: null, results: [], testimonial: null },
  case: { year: 2026, services: [], results: [{ label: "visitatori", value: "1.800" }], testimonial: null },
};

const caseDoc = (prefix: string): CaseStudyDocument => ({
  schemaVersion: 2,
  kind: "case_history",
  template: CASE_TEMPLATE,
  formats: Object.fromEntries(
    FORMAT_IDS.map((formatId) => [
      formatId,
      {
        pages: starterPages(CASE_TEMPLATE, "case_history", formatId, {
          newId: idFactory(prefix),
          texts: Object.fromEntries(TEMPLATE_TEXT_KEYS.map((k) => [k, `[${k}]`])),
          images: [],
          resultRows: 1,
          hasTestimonial: false,
        }),
      },
    ]),
  ),
});

// The client template arrives with Stories 3.9 and 3.11: its intro and closing pages are
// stand-ins made from a case's, with the client's roles.
const clientDoc = (prefix: string): CaseStudyDocument => {
  const from = caseDoc(prefix);
  const formats = Object.fromEntries(
    Object.entries(from.formats).map(([formatId, { pages }]) => {
      const intro: Page = { ...pages[0], pageKey: "client-intro", name: "Introduzione", role: "intro", section: "intro" };
      const outro: Page[] = [
        { ...pages[pages.length - 1], pageKey: "client-outro", name: "Chiusura cliente", role: "outro", section: "risultati" },
      ];
      if (formatId === "carosello_1_1") outro.push({ ...outro[0], pageKey: "closing", name: "Chiusura" });
      return [formatId, { pages: [intro, ...outro] }];
    }),
  );
  return { ...from, kind: "client_intro", formats };
};

const casePart = (caseId: string, clientId: string): CasePart => ({
  kind: "case_history",
  caseId,
  clientId,
  doc: caseDoc(caseId.padEnd(8, "0").slice(0, 8)),
  assets: {},
  values: VALUES,
});
const introPart = (clientId: string): ClientIntroPart => ({
  kind: "client_intro",
  clientId,
  doc: clientDoc("eeeeeeee"),
  assets: {},
  values: VALUES,
});

/** Each page as `{part}:{pageKey}#{number}`. */
const flat = (file: ComposedFile) =>
  file.segments.flatMap((s) =>
    s.pages.map((p, i) => `${s.part.kind === "case_history" ? s.part.caseId : `intro-${s.part.clientId}`}:${p.pageKey}#${s.startPage + i}`),
  );
const keysOf = (part: CasePart | ClientIntroPart, formatId: FormatId) => part.doc.formats[formatId].pages.map((p) => p.pageKey);

describe("composeParts", () => {
  it.each(FORMAT_IDS)("one case keeps all its pages, numbered from 1 (%s)", (formatId) => {
    const a = casePart("aaaa", "lumen");
    const file = composeParts([introPart("lumen"), a], formatId);
    expect(flat(file)).toEqual(keysOf(a, formatId).map((k, i) => `aaaa:${k}#${i + 1}`));
  });

  it("two cases of one client: client intro, cases without their intro or Carosello Chiusura, Risultati kept, client closing", () => {
    const [a, b, intro] = [casePart("aaaa", "lumen"), casePart("bbbb", "lumen"), introPart("lumen")];
    const carosello = keysOf(a, "carosello_1_1");
    expect(carosello).toContain("closing");
    expect(carosello).toContain("results");

    const file = composeParts([a, intro, b], "carosello_1_1");
    const body = a.doc.formats.carosello_1_1.pages.filter((p) => p.role !== "intro" && p.pageKey !== "closing").map((p) => p.pageKey);
    expect(body).toContain("results");
    const expected = [
      "intro-lumen:client-intro",
      ...body.map((k) => `aaaa:${k}`),
      ...body.map((k) => `bbbb:${k}`),
      "intro-lumen:client-outro",
      "intro-lumen:closing",
    ].map((k, i) => `${k}#${i + 1}`);
    expect(flat(file)).toEqual(expected);
  });

  it("keeps a Presentazione or Video case's outro pages (only Carosello drops its Chiusura)", () => {
    for (const formatId of ["presentazione_16_9", "video_9_16"] as const) {
      const [a, b] = [casePart("aaaa", "lumen"), casePart("bbbb", "lumen")];
      const file = composeParts([introPart("lumen"), a, b], formatId);
      for (const [i, part] of [a, b].entries()) {
        const kept = part.doc.formats[formatId].pages.filter((p) => p.role !== "intro");
        expect(kept.some((p) => p.role === "outro")).toBe(true);
        expect(file.segments[i + 1].pages).toHaveLength(kept.length);
        file.segments[i + 1].pages.forEach((page, j) => expect(page).toBe(kept[j]));
      }
      expect(file.segments.map((s) => s.slot)).toEqual(["client_intro", "case", "case", "client_closing"]);
    }
  });

  it("applies the rule per client in a mixed file, in the order of the parts", () => {
    const parts = [
      introPart("lumen"),
      introPart("orto"),
      casePart("aaaa", "lumen"),
      casePart("cccc", "orto"),
      casePart("bbbb", "lumen"),
    ];
    const file = composeParts(parts, "presentazione_16_9");
    expect(file.segments.map((s) => (s.part.kind === "case_history" ? s.part.caseId : `intro-${s.part.clientId}`))).toEqual([
      "intro-lumen",
      "aaaa",
      "cccc", // Orto has one case here: it keeps its own pages and its intro document is left out.
      "bbbb",
      "intro-lumen",
    ]);
    expect(file.segments[2].pages).toBe(parts[3].doc.formats.presentazione_16_9.pages);
    const numbers = flat(file).map((s) => Number(s.split("#")[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("wraps three cases of one client once: the middle case gets neither the client intro nor the closing", () => {
    const parts = [introPart("lumen"), casePart("aaaa", "lumen"), casePart("bbbb", "lumen"), casePart("cccc", "lumen")];
    const file = composeParts(parts, "presentazione_16_9");
    expect(file.segments.map((s) => s.key)).toEqual([
      "client_intro:lumen",
      "case:aaaa",
      "case:bbbb",
      "case:cccc",
      "client_closing:lumen",
    ]);
  });

  it("leaves out an intro document whose client has no case in the file", () => {
    const a = casePart("aaaa", "lumen");
    const file = composeParts([introPart("orto"), a], "video_9_16");
    expect(file.segments.map((s) => s.key)).toEqual(["case:aaaa"]);
  });

  it("skips a part with no pages in the format without skipping a number", () => {
    const [a, b, c] = [casePart("aaaa", "lumen"), casePart("bbbb", "orto"), casePart("cccc", "verde")];
    const empty = { ...b, doc: { ...b.doc, formats: { ...b.doc.formats, video_9_16: { pages: [] } } } };
    const file = composeParts([a, empty, c], "video_9_16");
    expect(file.segments.map((s) => s.key)).toEqual(["case:aaaa", "case:cccc"]);
    expect(file.segments[1].startPage).toBe(a.doc.formats.video_9_16.pages.length + 1);
  });

  it("keeps every case's own pages when the client has no intro document", () => {
    const [a, b] = [casePart("aaaa", "lumen"), casePart("bbbb", "lumen")];
    const file = composeParts([a, b], "carosello_1_1");
    expect(file.segments.map((s) => s.pages)).toEqual([a.doc.formats.carosello_1_1.pages, b.doc.formats.carosello_1_1.pages]);
  });

  it("returns the revisions' own page objects, never copies", () => {
    const [a, b, intro] = [casePart("aaaa", "lumen"), casePart("bbbb", "lumen"), introPart("lumen")];
    const file = composeParts([intro, a, b], "video_9_16");
    const own = new Set([a, b, intro].flatMap((p) => p.doc.formats.video_9_16.pages));
    for (const page of file.segments.flatMap((s) => s.pages)) expect(own.has(page)).toBe(true);
  });

  it("throws for a missing format, a document of the other kind, a repeated case or two intro documents", () => {
    const a = casePart("aaaa", "lumen");
    const rest = Object.fromEntries(Object.entries(a.doc.formats).filter(([formatId]) => formatId !== "video_9_16"));
    expect(() => composeParts([{ ...a, doc: { ...a.doc, formats: rest } }], "video_9_16")).toThrow(/FORMAT_NOT_IN_REVISION/);
    expect(() => composeParts([introPart("lumen"), introPart("lumen"), a], "video_9_16")).toThrow(/two intro documents/);
    expect(() => composeParts([{ ...introPart("lumen"), doc: a.doc }], "video_9_16")).toThrow(/client_intro part/);
    expect(() => composeParts([{ ...a, doc: introPart("lumen").doc }], "video_9_16")).toThrow(/case_history part/);
    expect(() => composeParts([a, casePart("aaaa", "lumen")], "video_9_16")).toThrow(/appears twice/);
  });

  it("returns no segments for no parts", () => {
    expect(composeParts([], "carosello_1_1").segments).toEqual([]);
  });
});

describe("renderComposed", () => {
  it("draws every segment with continuous page numbers", () => {
    const file = composeParts([introPart("lumen"), casePart("aaaa", "lumen"), casePart("bbbb", "lumen")], "carosello_1_1");
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(renderComposed(file, { still: true }));
    const pages = [...host.querySelectorAll("[data-page-number]")];
    expect(pages.map((p) => p.getAttribute("data-page-key"))).toEqual(flat(file).map((s) => s.split(":")[1].split("#")[0]));
    expect(pages.map((p) => Number(p.getAttribute("data-page-number")))).toEqual(pages.map((_, i) => i + 1));
  });
});
