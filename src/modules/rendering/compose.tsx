import { Fragment, type ReactElement } from "react";
import type { CaseStudyDocument, Page } from "@/modules/generation";
import { BRAND_PAGES, BRAND_TEMPLATE, hasBrandPages, NO_BOUND_VALUES } from "@/modules/rendering/brand/pages";
import { FORMAT_NOT_IN_REVISION, type FormatId } from "@/modules/rendering/domain/formats";
import { renderFormat } from "@/modules/rendering/templates";
import type { BoundValues, RenderAsset, RenderOptions } from "@/modules/rendering/templates/types";

/**
 * One document in a combined file (C38, SCP 2026-10-28): a case history or a client's
 * intro document, with its revision's (upgraded) document and what its renderer needs.
 */
interface PartBase {
  clientId: string;
  /** The revision's document; its pages are drawn as they are, never copied (AD-25). */
  doc: CaseStudyDocument;
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
}
export interface CasePart extends PartBase {
  kind: "case_history";
  caseId: string;
}
export interface ClientIntroPart extends PartBase {
  kind: "client_intro";
}
export type ComposePart = CasePart | ClientIntroPart;
/**
 * MAC's own pages around a Presentazione file (`brand/pages.ts`): never a document's, never
 * given in the parts. `composeParts` adds its two runs itself.
 */
export interface BrandPart {
  kind: "brand";
}

/** A run of one part's pages in the file, and the number of its first page. */
export interface ComposedSegment {
  /** Unique in the file and stable when cases move: a React key, and what 4.12 and 5.10 address. */
  key: string;
  /** Which run this is: a client intro part fills two, its intro and its closing; MAC's pages open and close a Presentazione file. */
  slot: "brand_intro" | "client_intro" | "case" | "client_closing" | "brand_outro";
  part: ComposePart | BrandPart;
  /** The same page objects as in `part.doc` (MAC's: the constants, or the given `brand` pages), so an edit here is an edit of that revision. */
  pages: readonly Page[];
  startPage: number;
}

export interface ComposedFile {
  formatId: FormatId;
  segments: readonly ComposedSegment[];
}

export interface ComposeOptions {
  /**
   * Story 4.12a, the client's file in the configurator: every client's intro document is
   * included whatever its number of cases (one, or none: then its intro and closing only),
   * and its cases are always trimmed as in a file (no own intro pages, no Carosello Chiusura),
   * even with no intro document among the parts (the intro isn't ready yet). Exports leave it
   * off: their files are unchanged.
   */
  clientFile?: boolean;
  /**
   * Story 5.9a, a client's pack: a client's intro document, when it is among the parts, is
   * included whatever its number of cases (one is enough), with its cases trimmed as in a
   * file. Without an intro part, every case keeps all its pages (as by default). A client
   * with no case in the parts gets nothing. Single-case exports leave it off.
   */
  pack?: boolean;
  /**
   * MAC's pages in Presentazione (default `BRAND_PAGES`): its `intro` page opens the file, its
   * `outro` page closes it. A collection passes its own copies (its words, its hidden ones left
   * out). Ignored in every other format: they have no MAC pages.
   */
  brand?: readonly Page[];
}

/** A case's own Chiusura in Carosello: the client file ends with the client's own, once. */
const CAROSELLO = "carosello_1_1";
const CASE_CLOSING_KEY = "closing";

function pagesOf(part: ComposePart, formatId: FormatId): readonly Page[] {
  const entry = Object.hasOwn(part.doc.formats, formatId) ? part.doc.formats[formatId] : undefined;
  if (entry === undefined) throw new Error(`${FORMAT_NOT_IN_REVISION}: ${formatId} is not in a ${part.kind} part's document`);
  return entry.pages;
}

/**
 * The pages of a combined file in one format, in order (C38; Stories 4.12, 5.9, 5.10).
 * For each client with an intro document and 2 or more case histories in `parts`: the
 * client's intro pages before its first case, each of its cases without its own intro
 * pages (and, in Carosello, its own Chiusura; Risultati e testimonial stay), and the
 * client's closing pages once after its last case. Otherwise every case keeps all its
 * pages and the client's intro document is left out. Cases keep the order of `parts`;
 * page numbers run on from 1. Pure: pages are the revisions' own objects.
 * Parts' `clientId`s are trusted: the caller builds them from the records.
 * With `options.clientFile` (Story 4.12a) a client's intro is included with any number of
 * cases, and cases are trimmed even without it; with `options.pack` (Story 5.9a) a client's
 * intro is included with one case or more (see {@link ComposeOptions}).
 * In Presentazione the file opens with MAC's intro and closes with MAC's outro (slots
 * `brand_intro` and `brand_outro`, `options.brand`), once, around a file with any page.
 * Throws for a bug: a format missing from a part, a part whose document is of the other
 * kind, the same case twice, or two intro documents for one client.
 */
export function composeParts(parts: readonly ComposePart[], formatId: FormatId, options: ComposeOptions = {}): ComposedFile {
  const clientFile = options.clientFile === true;
  const pack = options.pack === true;
  const intros = new Map<string, ClientIntroPart>();
  const caseCount = new Map<string, number>();
  const cases = new Set<string>();
  for (const part of parts) {
    if (part.doc.kind !== part.kind) throw new Error(`a ${part.kind} part holds a ${part.doc.kind} document`);
    if (part.kind === "client_intro") {
      if (intros.has(part.clientId)) throw new Error(`client ${part.clientId} has two intro documents`);
      intros.set(part.clientId, part);
    } else {
      if (cases.has(part.caseId)) throw new Error(`case ${part.caseId} appears twice`);
      cases.add(part.caseId);
      caseCount.set(part.clientId, (caseCount.get(part.clientId) ?? 0) + 1);
    }
  }
  const introOf = (clientId: string): ClientIntroPart | undefined =>
    clientFile || (pack && caseCount.has(clientId)) || (caseCount.get(clientId) ?? 0) >= 2 ? intros.get(clientId) : undefined;
  /** A case's pages in a file: without its own intro pages and, in Carosello, its own Chiusura. */
  const trimmed = (part: CasePart) =>
    pagesOf(part, formatId).filter((p) => p.role !== "intro" && !(formatId === CAROSELLO && p.pageKey === CASE_CLOSING_KEY));

  const segments: ComposedSegment[] = [];
  let next = 1;
  const push = (slot: ComposedSegment["slot"], part: ComposePart | BrandPart, pages: readonly Page[]) => {
    if (pages.length === 0) return;
    const key = part.kind === "case_history" ? `case:${part.caseId}` : part.kind === "brand" ? slot : `${slot}:${part.clientId}`;
    segments.push({ key, slot, part, pages, startPage: next });
    next += pages.length;
  };

  const seen = new Map<string, number>();
  for (const part of parts) {
    if (part.kind !== "case_history") continue;
    const intro = introOf(part.clientId);
    if (intro === undefined) {
      push("case", part, clientFile ? trimmed(part) : pagesOf(part, formatId));
      continue;
    }
    const index = (seen.get(part.clientId) ?? 0) + 1;
    seen.set(part.clientId, index);
    if (index === 1) push("client_intro", intro, pagesOf(intro, formatId).filter((p) => p.role === "intro"));
    push("case", part, trimmed(part));
    if (index === caseCount.get(part.clientId)) push("client_closing", intro, pagesOf(intro, formatId).filter((p) => p.role === "outro"));
  }
  // A client file with no case yet: its intro and closing alone.
  if (clientFile) {
    for (const [clientId, intro] of intros) {
      if (caseCount.has(clientId)) continue;
      push("client_intro", intro, pagesOf(intro, formatId).filter((p) => p.role === "intro"));
      push("client_closing", intro, pagesOf(intro, formatId).filter((p) => p.role === "outro"));
    }
  }
  return { formatId, segments: withBrand(segments, formatId, options.brand ?? BRAND_PAGES) };
}

const BRAND: BrandPart = Object.freeze({ kind: "brand" });

/** `segments` with MAC's intro first and its outro last, in Presentazione and around any page; numbered on. */
function withBrand(segments: ComposedSegment[], formatId: FormatId, brand: readonly Page[]): ComposedSegment[] {
  if (!hasBrandPages(formatId) || segments.length === 0) return segments;
  const intro = brand.filter((p) => p.role === "intro");
  const outro = brand.filter((p) => p.role === "outro");
  const out: ComposedSegment[] = [];
  let next = 1;
  const push = (segment: Omit<ComposedSegment, "startPage">) => {
    if (segment.pages.length === 0) return;
    out.push({ ...segment, startPage: next });
    next += segment.pages.length;
  };
  push({ key: "brand_intro", slot: "brand_intro", part: BRAND, pages: intro });
  for (const segment of segments) push(segment);
  push({ key: "brand_outro", slot: "brand_outro", part: BRAND, pages: outro });
  return out;
}

/**
 * A combined file drawn with each part's own renderer, numbered continuously. The same
 * element serves the client configurator and exports (`renderToStaticMarkup`).
 */
export function renderComposed(file: ComposedFile, options: Omit<RenderOptions, "startPage"> = {}): ReactElement {
  return (
    <>
      {file.segments.map((segment) => (
        <Fragment key={segment.key}>
          {segment.part.kind === "brand"
            ? renderFormat(BRAND_TEMPLATE, file.formatId, { pages: segment.pages, assets: {}, values: NO_BOUND_VALUES, options: { ...options, startPage: segment.startPage } })
            : renderFormat(segment.part.doc.template, file.formatId, {
                pages: segment.pages,
                assets: segment.part.assets,
                values: segment.part.values,
                options: { ...options, startPage: segment.startPage },
              })}
        </Fragment>
      ))}
    </>
  );
}
