// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pageSchema, type CaseStudyDocument, type Page } from "@/modules/generation";
import {
  BRAND_INTRO,
  BRAND_INTRO_KEY,
  BRAND_OUTRO,
  BRAND_OUTRO_KEY,
  BRAND_PAGES,
  BRAND_TEMPLATE,
  BRAND_TITLE_ELEMENT_ID,
  renderFormat,
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
  type ComposeOptions,
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

/** A segment's part as the expectations name it: a case by its id, a client's intro as `intro-{client}`, MAC's pages as `mac`. */
const nameOf = (part: ComposedFile["segments"][number]["part"]) =>
  part.kind === "case_history" ? part.caseId : part.kind === "brand" ? "mac" : `intro-${part.clientId}`;

/** Each page as `{part}:{pageKey}#{number}`. */
const flat = (file: ComposedFile) => file.segments.flatMap((s) => s.pages.map((p, i) => `${nameOf(s.part)}:${p.pageKey}#${s.startPage + i}`));
const keysOf = (part: CasePart | ClientIntroPart, formatId: FormatId) => part.doc.formats[formatId].pages.map((p) => p.pageKey);

/** The C38 rules alone: no MAC pages around a Presentazione file (they have their own tests below). */
const RULES: ComposeOptions = { brand: [] };

describe("composeParts", () => {
  it.each(FORMAT_IDS)("one case keeps all its pages, numbered from 1 (%s)", (formatId) => {
    const a = casePart("aaaa", "lumen");
    const file = composeParts([introPart("lumen"), a], formatId, RULES);
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
      const file = composeParts([introPart("lumen"), a, b], formatId, RULES);
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
    const file = composeParts(parts, "presentazione_16_9", RULES);
    expect(file.segments.map((s) => nameOf(s.part))).toEqual([
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
    const file = composeParts(parts, "presentazione_16_9", RULES);
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

  describe("the client file (Story 4.12a, clientFile)", () => {
    it.each(FORMAT_IDS)("includes the intro with one case, the case trimmed as in a file (%s)", (formatId) => {
      const [intro, a] = [introPart("lumen"), casePart("aaaa", "lumen")];
      const file = composeParts([intro, a], formatId, { ...RULES, clientFile: true });
      expect(file.segments.map((s) => s.key)).toEqual(["client_intro:lumen", "case:aaaa", "client_closing:lumen"]);
      const casePages = file.segments[1].pages;
      expect(casePages.some((p) => p.role === "intro")).toBe(false);
      expect(casePages.some((p) => p.pageKey === "closing")).toBe(false);
      // Risultati e testimonial stay; in Carosello only the case's own Chiusura goes.
      const expected = a.doc.formats[formatId].pages.filter((p) => p.role !== "intro" && !(formatId === "carosello_1_1" && p.pageKey === "closing"));
      expect(casePages).toEqual(expected);
      expect(flat(file).at(-1)).toMatch(new RegExp(`#${expected.length + file.segments[0].pages.length + file.segments[2].pages.length}$`));
    });

    it("trims the cases even with no intro document (the intro isn't ready)", () => {
      const [a, b] = [casePart("aaaa", "lumen"), casePart("bbbb", "lumen")];
      const file = composeParts([a, b], "carosello_1_1", { clientFile: true });
      expect(file.segments.map((s) => s.key)).toEqual(["case:aaaa", "case:bbbb"]);
      for (const segment of file.segments) expect(segment.pages.some((p) => p.role === "intro" || p.pageKey === "closing")).toBe(false);
    });

    it("shows a client's intro and closing alone when it has no case", () => {
      const file = composeParts([introPart("lumen")], "presentazione_16_9", { ...RULES, clientFile: true });
      expect(file.segments.map((s) => s.key)).toEqual(["client_intro:lumen", "client_closing:lumen"]);
    });

    it("leaves an export's file unchanged without the option", () => {
      const [intro, a] = [introPart("lumen"), casePart("aaaa", "lumen")];
      expect(composeParts([intro, a], "carosello_1_1")).toEqual(composeParts([intro, a], "carosello_1_1", {}));
      expect(composeParts([intro, a], "carosello_1_1").segments.map((s) => s.key)).toEqual(["case:aaaa"]);
    });
  });

  describe("the client pack (Story 5.9a, pack)", () => {
    it.each(FORMAT_IDS)("wraps one case in the client's intro and closing, the case trimmed (%s)", (formatId) => {
      const [intro, a] = [introPart("lumen"), casePart("aaaa", "lumen")];
      const file = composeParts([intro, a], formatId, { ...RULES, pack: true });
      expect(file.segments.map((s) => s.key)).toEqual(["client_intro:lumen", "case:aaaa", "client_closing:lumen"]);
      const expected = a.doc.formats[formatId].pages.filter((p) => p.role !== "intro" && !(formatId === "carosello_1_1" && p.pageKey === "closing"));
      expect(file.segments[1].pages).toEqual(expected);
      const numbers = flat(file).map((k) => Number(k.split("#")[1]));
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    });

    it("puts the intro first, the cases in the parts' order, and the closing once", () => {
      const parts = [introPart("lumen"), casePart("cccc", "lumen"), casePart("aaaa", "lumen"), casePart("bbbb", "lumen")];
      const file = composeParts(parts, "presentazione_16_9", { ...RULES, pack: true });
      expect(file.segments.map((s) => s.key)).toEqual(["client_intro:lumen", "case:cccc", "case:aaaa", "case:bbbb", "client_closing:lumen"]);
    });

    it("drops each case's own Carosello Chiusura and keeps Risultati; the client's closing comes once", () => {
      const [intro, a, b] = [introPart("lumen"), casePart("aaaa", "lumen"), casePart("bbbb", "lumen")];
      const file = composeParts([intro, a, b], "carosello_1_1", { pack: true });
      for (const segment of file.segments.filter((s) => s.slot === "case")) {
        expect(segment.pages.some((p) => p.pageKey === "closing" || p.role === "intro")).toBe(false);
        expect(segment.pages.some((p) => p.pageKey === "results")).toBe(true);
      }
      expect(file.segments.filter((s) => s.slot === "client_closing")).toHaveLength(1);
    });

    it("keeps every case whole without an intro part (the intro isn't approved)", () => {
      const [a, b] = [casePart("aaaa", "lumen"), casePart("bbbb", "lumen")];
      const file = composeParts([a, b], "carosello_1_1", { pack: true });
      expect(file.segments.map((s) => s.pages)).toEqual([a.doc.formats.carosello_1_1.pages, b.doc.formats.carosello_1_1.pages]);
    });

    it("gives an intro with no case nothing", () => {
      expect(composeParts([introPart("lumen")], "presentazione_16_9", { pack: true }).segments).toEqual([]);
    });
  });

  it("returns no segments for no parts", () => {
    expect(composeParts([], "carosello_1_1").segments).toEqual([]);
  });
});

describe("MAC's pages around a Presentazione file", () => {
  const P = "presentazione_16_9";
  const macKeys = (file: ComposedFile) => [file.segments[0]!.key, file.segments.at(-1)!.key];

  it.each([
    ["a single case", [casePart("aaaa", "lumen")], {}],
    ["a client's pack", [introPart("lumen"), casePart("aaaa", "lumen")], { pack: true }],
    ["a client's file", [introPart("lumen"), casePart("aaaa", "lumen"), casePart("bbbb", "lumen")], { clientFile: true }],
    ["a collection of several clients", [introPart("lumen"), casePart("aaaa", "lumen"), casePart("bbbb", "lumen"), casePart("cccc", "orto")], {}],
  ] as const)("opens %s with MAC's intro and closes it with MAC's outro, once, numbered on", (_, parts, options) => {
    const file = composeParts(parts, P, options);
    const without = composeParts(parts, P, { ...options, brand: [] });
    expect(macKeys(file)).toEqual(["brand_intro", "brand_outro"]);
    expect(file.segments.filter((s) => s.part.kind === "brand").map((s) => s.slot)).toEqual(["brand_intro", "brand_outro"]);
    expect(file.segments[0]!.pages).toEqual([BRAND_INTRO]);
    expect(file.segments[0]!.pages[0]).toBe(BRAND_INTRO);
    expect(file.segments.at(-1)!.pages[0]).toBe(BRAND_OUTRO);
    // The parts' own pages are the same runs, one page later.
    expect(file.segments.slice(1, -1).map((s) => [s.key, s.pages, s.startPage - 1])).toEqual(without.segments.map((s) => [s.key, s.pages, s.startPage]));
    const numbers = flat(file).map((k) => Number(k.split("#")[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(flat(file).at(-1)).toBe(`mac:${BRAND_OUTRO.pageKey}#${numbers.length}`);
  });

  it.each(["carosello_1_1", "video_9_16"] as const)("leaves %s as it was: no MAC page", (formatId) => {
    const file = composeParts([introPart("lumen"), casePart("aaaa", "lumen"), casePart("bbbb", "lumen")], formatId);
    expect(file.segments.some((s) => s.part.kind === "brand")).toBe(false);
    expect(file).toEqual(composeParts([introPart("lumen"), casePart("aaaa", "lumen"), casePart("bbbb", "lumen")], formatId, { brand: [] }));
  });

  it("adds nothing around a file with no page", () => {
    expect(composeParts([], P).segments).toEqual([]);
    expect(composeParts([introPart("lumen")], P, { pack: true }).segments).toEqual([]);
  });

  it("draws the MAC pages it is given: a collection's copy, or only the outro when the intro is hidden", () => {
    const worded = { ...BRAND_INTRO, blocks: [] };
    expect(composeParts([casePart("aaaa", "lumen")], P, { brand: [worded, BRAND_OUTRO] }).segments[0]!.pages[0]).toBe(worded);
    const file = composeParts([casePart("aaaa", "lumen")], P, { brand: [BRAND_OUTRO] });
    expect(file.segments.map((s) => s.key)).toEqual(["case:aaaa", "brand_outro"]);
    expect(file.segments[0]!.startPage).toBe(1);
  });

  it("are valid pages with constant ids, the title the one free text", () => {
    for (const page of BRAND_PAGES) expect(pageSchema.safeParse(page).success).toBe(true);
    expect(BRAND_PAGES.map((p) => [p.pageKey, p.role])).toEqual([
      [BRAND_INTRO_KEY, "intro"],
      [BRAND_OUTRO_KEY, "outro"],
    ]);
    expect(BRAND_INTRO.blocks.flatMap((b) => b.elements)).toEqual([expect.objectContaining({ elementId: BRAND_TITLE_ELEMENT_ID, type: "text", text: "Our projects" })]);
    expect(BRAND_OUTRO.blocks).toEqual([]);
    expect(Object.isFrozen(BRAND_INTRO.blocks[0]!.elements[0])).toBe(true);
  });

  it("are drawn by their own renderer: the title, MAC's details, the W-Group link, numbered with the file", () => {
    const file = composeParts([casePart("aaaa", "lumen")], P);
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(renderComposed(file, { still: true }));
    const pages = [...host.querySelectorAll<HTMLElement>("section.mr-page")];
    expect(pages.map((p) => Number(p.dataset.pageNumber))).toEqual(pages.map((_, i) => i + 1));
    const [intro, outro] = [pages[0]!, pages.at(-1)!];
    expect(intro.matches("[data-brand]") && outro.matches("[data-brand]")).toBe(true);
    expect(pages.slice(1, -1).some((p) => p.matches("[data-brand]"))).toBe(false);
    expect(intro.dataset.pageKey).toBe(BRAND_INTRO_KEY);
    expect(intro.querySelector(`[data-element-id="${BRAND_TITLE_ELEMENT_ID}"]`)?.textContent).toBe("Our projects");
    expect(intro.textContent).toContain("Men At Code S.r.l.");
    expect(intro.textContent).toContain("www.menatcode.it");
    // Only the title is a document element: nothing else on MAC's pages can be addressed.
    expect([...host.querySelectorAll("[data-brand] [data-element-id]")]).toHaveLength(1);
    for (const text of ["Sede operativa", "Via Lomazzo, 27 — 20154 Milano", "Sede legale", "Via Pietro Nenni, 18 — 25124 Brescia", "04216420986", "03795980980"]) {
      expect(outro.textContent).toContain(text);
    }
    const link = outro.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://w-group.it/");
    expect(link?.textContent).toBe("W-Group");
    // The art is inline SVG (no file to load), its gradient ids unique in the document.
    expect(host.querySelectorAll("img")).toHaveLength(0);
    const ids = [...host.querySelectorAll("[data-brand] [id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(intro.querySelectorAll("svg path")).toHaveLength(3);
  });

  it("draws a collection's words for the title", () => {
    const worded = { ...BRAND_INTRO, blocks: [{ ...BRAND_INTRO.blocks[0]!, elements: [{ ...BRAND_INTRO.blocks[0]!.elements[0]!, text: "I nostri progetti" }] }] } as typeof BRAND_INTRO;
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(renderFormat(BRAND_TEMPLATE, P, { pages: [worded], assets: {}, values: VALUES }));
    expect(host.querySelector(`[data-element-id="${BRAND_TITLE_ELEMENT_ID}"]`)?.textContent).toBe("I nostri progetti");
  });

  it("refuses another format (a bug)", () => {
    expect(() => renderFormat(BRAND_TEMPLATE, "carosello_1_1", { pages: [BRAND_INTRO], assets: {}, values: VALUES })).toThrow(/presentazione_16_9 only/);
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
