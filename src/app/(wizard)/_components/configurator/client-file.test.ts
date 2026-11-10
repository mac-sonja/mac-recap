import { describe, expect, it } from "vitest";
import type { Page } from "@/modules/generation";
import { CASE_TEMPLATE, CLIENT_TEMPLATE, FORMAT_IDS, starterPages, TEMPLATE_TEXT_KEYS, type BoundValues, type FormatId } from "@/modules/rendering";
import {
  CLOSING_SEGMENT,
  fileKeyAfterEdit,
  filePages,
  fileSegments,
  INTRO_SEGMENT,
  mergePart,
  partsChanged,
  splitFile,
  splitFilePageKey,
  type FilePartData,
} from "./client-file";
import type { Formats } from "./use-document";

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const VALUES: BoundValues = {
  client: { name: "Lumen", sector: "", description: "", logoUrl: null, results: [], testimonial: null },
  case: { year: null, services: [], results: [], testimonial: null },
};
const formatsOf = (template: string, kind: "case_history" | "client_intro"): Formats =>
  Object.fromEntries(
    FORMAT_IDS.map((id) => [
      id,
      starterPages(template, kind, id, { newId, texts: Object.fromEntries(TEMPLATE_TEXT_KEYS.map((k) => [k, k])), images: [], resultRows: 1, hasTestimonial: false }),
    ]),
  ) as unknown as Formats;
const part = (key: string, kind: "case" | "client_intro"): FilePartData => ({
  key,
  subject: kind === "case" ? { kind: "case", id: key } : { kind: "client_intro", id: key, clientId: "c" },
  status: "approved",
  name: key,
  code: key,
  template: kind === "case" ? CASE_TEMPLATE : CLIENT_TEMPLATE,
  formats: kind === "case" ? formatsOf(CASE_TEMPLATE, "case_history") : formatsOf(CLIENT_TEMPLATE, "client_intro"),
  generatedTexts: {},
  images: [],
  values: VALUES,
  revision: { id: "r", version: 1, editable: true, kind: kind === "case" ? "case_history" : "client_intro" },
  headVersion: 1,
  assets: {},
});

const intro = part("client_intro:i", "client_intro");
const a = part("case:a", "case");
const b = part("case:b", "case");
const own = (p: FilePartData) => p.formats;
const F: FormatId = "presentazione_16_9";

describe("the client's file (Story 4.12a)", () => {
  it("segments: the intro's intro pages, each case without its own intro, the intro's outro pages; keys prefixed", () => {
    const segments = fileSegments(intro, [a, b], F, own);
    expect(segments.map((s) => [s.key, s.partKey])).toEqual([
      [INTRO_SEGMENT, intro.key],
      ["case:a", "case:a"],
      ["case:b", "case:b"],
      [CLOSING_SEGMENT, intro.key],
    ]);
    expect(segments[1]!.pages.map((p) => p.pageKey)).toEqual(["case:a|content", "case:a|results"]);
    // The same object every time: untouched pages keep their identity.
    expect(fileSegments(intro, [a, b], F, own)[1]!.pages[0]).toBe(segments[1]!.pages[0]);
  });

  it("lists the intro's segments only with an intro", () => {
    expect(fileSegments(null, [a], F, own).map((s) => s.key)).toEqual(["case:a"]);
  });

  it("splits an edit back into each segment's own pages and keys", () => {
    const segments = fileSegments(intro, [a, b], F, own);
    const pages = filePages(segments);
    const edited = pages.map((p) => (p.pageKey === "case:b|content" ? { ...p, name: "Nuova" } : p));
    const cut = splitFile(edited, segments)!;
    expect(cut.get("case:b")!.map((p) => p.pageKey)).toEqual(["content", "results"]);
    expect(cut.get("case:b")![0]!.name).toBe("Nuova");
    // An untouched page is its part's own object.
    expect(cut.get("case:a")![0]).toBe(a.formats[F].find((p) => p.pageKey === "content"));
  });

  it("refuses a page moved into another part, or from Introduzione to Chiusura", () => {
    const segments = fileSegments(intro, [a, b], F, own);
    const pages = filePages(segments);
    const moved = [...pages];
    const [page] = moved.splice(1, 1);
    moved.splice(4, 0, page!);
    expect(splitFile(moved, segments)).toBeNull();
    const introToClosing = [...pages.slice(1), pages[0]!];
    expect(splitFile(introToClosing, segments)).toBeNull();
  });

  it("a new page joins the segment before it, with the intro's role in Introduzione and Chiusura", () => {
    const segments = fileSegments(intro, [a, b], F, own);
    const pages = filePages(segments);
    const fresh: Page = { ...pages[1]!, pageKey: "p-new", role: "body" };
    const afterIntro = [pages[0]!, fresh, ...pages.slice(1)];
    expect(splitFile(afterIntro, segments)!.get(INTRO_SEGMENT)!.map((p) => [p.pageKey, p.role])).toEqual([
      ["intro", "intro"],
      ["p-new", "intro"],
    ]);
    expect(fileKeyAfterEdit(afterIntro, "p-new", segments)).toBe(`${INTRO_SEGMENT}|p-new`);
    const atEnd = [...pages, fresh];
    expect(splitFile(atEnd, segments)!.get(CLOSING_SEGMENT)!.at(-1)).toMatchObject({ pageKey: "p-new", role: "outro" });
    expect(splitFilePageKey("case:a|content")).toEqual({ segment: "case:a", pageKey: "content" });
  });

  it("merges a case's shown pages back around the pages the file doesn't show", () => {
    const old = a.formats[F];
    const shown = old.filter((p) => p.role !== "intro");
    expect(mergePart(old, shown, shown)).toBe(old);
    const edited = [{ ...shown[0]!, name: "x" }, shown[1]!];
    expect(mergePart(old, shown, edited).map((p) => p.pageKey)).toEqual(old.map((p) => p.pageKey));
    expect(mergePart(old, shown, [shown[1]!]).map((p) => p.pageKey)).toEqual(["intro", "results"]);
  });

  it("names only the parts an edit changed, with their whole new formats", () => {
    const segments = Object.fromEntries(FORMAT_IDS.map((id) => [id, fileSegments(intro, [a, b], id, own)])) as Record<FormatId, ReturnType<typeof fileSegments>>;
    const shownNow = Object.fromEntries(FORMAT_IDS.map((id) => [id, filePages(segments[id])])) as Record<FormatId, Page[]>;
    const next = { ...shownNow, [F]: shownNow[F].filter((p) => p.pageKey !== "case:a|content") };
    const changed = partsChanged(next, shownNow, segments, [intro, a, b], own)!;
    expect([...changed.keys()]).toEqual(["case:a"]);
    expect(changed.get("case:a")![F].map((p) => p.pageKey)).toEqual(["intro", "results"]);
    expect(changed.get("case:a")!.video_9_16).toBe(a.formats.video_9_16);
  });
});
