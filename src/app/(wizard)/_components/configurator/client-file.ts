import { CURRENT_SCHEMA_VERSION, type CaseStudyDocument, type DocumentKind, type Page } from "@/modules/generation";
import { composeParts, FORMAT_IDS, type BoundValues, type ComposePart, type FormatId, type RenderAsset } from "@/modules/rendering";
import type { CaseStatus } from "@/modules/access";
import type { ActionResult } from "@/app/_lib/action-result";
import type { GeneratedTexts } from "./default-pages";
import type { EditedRevision, ForkInput, ForkResult, Formats, SaveInput, Subject } from "./use-document";

/**
 * One document of the client's file (Story 4.12a): the client's intro, or one of its approved
 * cases. Its pages are its own revision's, never copied (AD-25): what is edited here is saved
 * to that revision, with its own version (AD-17).
 */
export interface FilePartData {
  /** `client_intro:{introId}` or `case:{caseId}`: unique in the file. */
  key: string;
  /** The intro (`client_intro`) or the case (`case`): what its saves and fork are keyed by. */
  subject: Extract<Subject, { kind: "case" | "client_intro" }>;
  /** The case's (or the intro's) status: the intro's drives the top bar. */
  status: CaseStatus;
  /** A case's name and code (its group label); the client's for the intro. */
  name: string;
  code: string;
  template: string;
  /** Every page of the revision, per format: the file shows some of them (`composeParts`). */
  formats: Formats;
  /** What Pagine di default fills this part's pages with. */
  generatedTexts: GeneratedTexts;
  images: readonly string[];
  /** The part's bound values: a case's own `case` values; the client's are shared. */
  values: BoundValues;
  revision: EditedRevision & { kind: DocumentKind };
  /** The intro's or case's `head_version` as read (the fork's and approval's compare-and-set). */
  headVersion: number;
  /** The render assets its pages draw. */
  assets: Readonly<Record<string, RenderAsset>>;
  /** A case's own files (ids): with the client's, the only files its pages may show. */
  ownAssetIds?: readonly string[];
  /** A case's own configurator, where its copy is published (Aggiorna) or dropped (Scarta). */
  href?: string;
}

/** What reloading one part asks for: the intro, or one case, of client `clientId`. */
export type FilePartRef = { clientId: string; part: "client_intro" } | { clientId: string; part: "case"; caseId: string };

/** What saving the order of the client's cases takes (Story 4.12b): every case of the file, in order. */
export interface CaseOrderInput {
  clientId: string;
  caseIds: string[];
}

/**
 * The client's whole file (Story 4.12a): the intro (null while it isn't ready: missing, Bozza
 * or In elaborazione), then its approved cases in the client's order (Story 4.12b; newest
 * created first until reordered). Each part saves to its own revision through its own actions;
 * a stale part is read again alone (`onReload`).
 */
export interface ClientFile {
  clientId: string;
  intro: FilePartData | null;
  cases: readonly FilePartData[];
  onSaveIntro: (input: SaveInput) => Promise<ActionResult<{ version: number }>>;
  onForkIntro?: (input: ForkInput) => Promise<ActionResult<ForkResult>>;
  onSaveCase: (input: SaveInput) => Promise<ActionResult<{ version: number }>>;
  onForkCase: (input: ForkInput) => Promise<ActionResult<ForkResult>>;
  /** One part read again; `null`: the intro is no longer ready (or the case left the file). */
  onReload: (input: FilePartRef) => Promise<ActionResult<FilePartData | null>>;
  /**
   * Story 4.12b: saves the cases' order (a client setting, saved at once, never an undo step);
   * undefined: the project rows don't move (a role that may not reorder).
   */
  onReorderCases?: (input: CaseOrderInput) => Promise<ActionResult<{ caseIds: string[] }>>;
  /**
   * Story 4.12b: the client's case order as the server holds it (case ids), cases not in the file
   * included (a part that couldn't be read); null or absent: none saved yet. A save keeps those
   * where they are (`mergeCaseOrder`).
   */
  caseOrder?: readonly string[] | null;
}

/**
 * The case order to save (Story 4.12b): `saved` (the server's, case ids) with the file's cases,
 * wherever they sit in it, replaced in turn by `shown` (the file's cases in their new order); ids
 * the file doesn't show stay in their saved places; a shown case not in `saved` goes at the end.
 * With nothing saved, `shown` itself.
 */
export function mergeCaseOrder(saved: readonly string[], shown: readonly string[]): string[] {
  const shownSet = new Set(shown);
  const queue = [...shown];
  const merged = saved.map((id) => (shownSet.has(id) ? queue.shift()! : id));
  return [...merged, ...queue];
}

/**
 * `mounted` (the file's parts as mounted) with its cases in the order of `keys` (Story 4.12b): the
 * other parts first, then the named cases, then any case not named, as they were. `mounted` itself
 * when nothing moves.
 */
export function withCaseOrder<T extends { part: { key: string; subject: { kind: string } } }>(mounted: readonly T[], keys: readonly string[]): T[] {
  const isCase = (m: T) => m.part.subject.kind === "case";
  const byKey = new Map(mounted.filter(isCase).map((m) => [m.part.key, m]));
  const ordered = keys.flatMap((k) => byKey.get(k) ?? []);
  const rest = mounted.filter((m) => isCase(m) && !keys.includes(m.part.key));
  const next = [...mounted.filter((m) => !isCase(m)), ...ordered, ...rest];
  return next.length === mounted.length && next.every((m, i) => m === mounted[i]) ? (mounted as T[]) : next;
}

/** `keys` with `key` moved to index `to` (clamped); `keys` itself when it isn't there or doesn't move. */
export function moveKey(keys: readonly string[], key: string, to: number): readonly string[] {
  const from = keys.indexOf(key);
  const target = Math.max(0, Math.min(keys.length - 1, to));
  if (from < 0 || target === from) return keys;
  const next = keys.filter((k) => k !== key);
  next.splice(target, 0, key);
  return next;
}

/** Where a segment sits in the file. */
export type SegmentSlot = "client_intro" | "case" | "client_closing";

/** One run of the file's pages in one format: the intro's, a case's or the closing's. */
export interface FileSegment {
  /** `client_intro`, `client_closing` or the case's part key: the prefix of its pages' keys. */
  key: string;
  slot: SegmentSlot;
  /** The part whose revision holds these pages. */
  partKey: string;
  /** The part's pages, their keys prefixed with the segment's (`{segment}|{pageKey}`). */
  pages: readonly Page[];
}

const SEPARATOR = "|";
/** The intro and closing segments' keys (one client per file). */
export const INTRO_SEGMENT = "client_intro";
export const CLOSING_SEGMENT = "client_closing";

/** A page's key in the file: unique across parts, whose own keys repeat (`closing`, `intro`). */
export const filePageKey = (segment: string, pageKey: string) => `${segment}${SEPARATOR}${pageKey}`;

/** The segment and the part's own page key of a file page key; null for a page made here (not prefixed yet). */
export function splitFilePageKey(key: string): { segment: string; pageKey: string } | null {
  const at = key.indexOf(SEPARATOR);
  return at < 0 ? null : { segment: key.slice(0, at), pageKey: key.slice(at + 1) };
}

/** The part a file page key belongs to, among `segments`. */
export function partKeyOf(segments: readonly FileSegment[], pageKey: string): string | undefined {
  const segment = splitFilePageKey(pageKey)?.segment;
  return segments.find((s) => s.key === segment)?.partKey;
}

/**
 * A page shown in the file, by its part's own page object and segment: the same object every
 * time, so an untouched page keeps its identity (its memoised drawing) across edits elsewhere.
 */
const shown = new WeakMap<Page, Map<string, Page>>();
/** A shown page's own page object and segment. */
const origin = new WeakMap<Page, { page: Page; segment: string }>();

function prefixed(page: Page, segment: string): Page {
  let bySegment = shown.get(page);
  if (bySegment === undefined) {
    bySegment = new Map();
    shown.set(page, bySegment);
  }
  let out = bySegment.get(segment);
  if (out === undefined) {
    out = { ...page, pageKey: filePageKey(segment, page.pageKey) };
    bySegment.set(segment, out);
    origin.set(out, { page, segment });
  }
  return out;
}

/** A part's formats as a document `composeParts` reads (its pages untouched). */
const docOf = (part: FilePartData, formats: Formats): CaseStudyDocument =>
  ({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: part.subject.kind === "case" ? "case_history" : "client_intro",
    template: part.template,
    formats: Object.fromEntries(Object.entries(formats).map(([id, pages]) => [id, { pages }])),
  }) as CaseStudyDocument;

/**
 * The file's segments in one format (Story 4.12a), from `composeParts` with `clientFile`:
 * the intro's `intro` pages, each case without its own intro pages (and Carosello Chiusura),
 * then the intro's `outro` pages. Every segment is listed, even with no page (its group still
 * shows); the intro's two only when there is an intro. `formatsOf` gives each part's
 * current pages (its edits so far).
 */
export function fileSegments(
  intro: FilePartData | null,
  cases: readonly FilePartData[],
  formatId: FormatId,
  formatsOf: (part: FilePartData) => Formats,
): FileSegment[] {
  const parts: ComposePart[] = [];
  if (intro !== null) parts.push({ kind: "client_intro", clientId: "client", doc: docOf(intro, formatsOf(intro)), assets: {}, values: intro.values });
  for (const c of cases) parts.push({ kind: "case_history", caseId: c.key, clientId: "client", doc: docOf(c, formatsOf(c)), assets: {}, values: c.values });
  const composed = composeParts(parts, formatId, { clientFile: true });
  const pagesOf = (key: string) => composed.segments.find((s) => s.key === key)?.pages ?? [];
  const segments: FileSegment[] = [];
  if (intro !== null) segments.push({ key: INTRO_SEGMENT, slot: "client_intro", partKey: intro.key, pages: pagesOf("client_intro:client") });
  for (const c of cases) segments.push({ key: c.key, slot: "case", partKey: c.key, pages: pagesOf(`case:${c.key}`) });
  if (intro !== null) segments.push({ key: CLOSING_SEGMENT, slot: "client_closing", partKey: intro.key, pages: pagesOf("client_closing:client") });
  return segments.map((s) => ({ ...s, pages: s.pages.map((p) => prefixed(p, s.key)) }));
}

/** Every format's segments. */
export const fileSegmentsByFormat = (
  intro: FilePartData | null,
  cases: readonly FilePartData[],
  formatsOf: (part: FilePartData) => Formats,
): Record<FormatId, FileSegment[]> =>
  Object.fromEntries(FORMAT_IDS.map((id) => [id, fileSegments(intro, cases, id, formatsOf)])) as Record<FormatId, FileSegment[]>;

/** `page` with the role its segment shows: `intro` in Introduzione, `outro` in Chiusura, never `intro` in a case. */
function withSegmentRole(page: Page, segment: string): Page {
  const role = segment === INTRO_SEGMENT ? "intro" : segment === CLOSING_SEGMENT ? "outro" : page.role === "intro" ? "body" : page.role;
  return role === page.role ? page : { ...page, role };
}

/** The file's pages in one format, in order. */
export const filePages = (segments: readonly FileSegment[]): Page[] => segments.flatMap((s) => s.pages);

/**
 * An edit of the file's pages in one format, cut back into each segment's own pages: a page
 * still shown keeps its part's own object; an edited one takes its own key back; a page made
 * here (a new page, a default page) joins the segment of the page before it (the first
 * segment when it comes first). Every edited or new page takes its segment's role (`intro`
 * in Introduzione, `outro` in Chiusura, never `intro` in a case), so an edit that changed a
 * role (Pagine di default) never moves it out of its run. Null when the edit moved a page out
 * of its segment (into another part, or between Introduzione and Chiusura), or there is no
 * segment to put a page in.
 */
export function splitFile(pages: readonly Page[], segments: readonly FileSegment[]): Map<string, Page[]> | null {
  const order = segments.map((s) => s.key);
  const out = new Map<string, Page[]>(order.map((key) => [key, []]));
  let at = 0;
  for (const page of pages) {
    const known = origin.get(page);
    const split = known === undefined ? splitFilePageKey(page.pageKey) : null;
    let segment: string;
    let own: Page;
    if (known !== undefined) {
      segment = known.segment;
      own = known.page;
    } else if (split !== null && out.has(split.segment)) {
      segment = split.segment;
      own = withSegmentRole({ ...page, pageKey: split.pageKey }, segment);
    } else {
      segment = order[at]!;
      if (segment === undefined) return null;
      own = withSegmentRole(page, segment);
    }
    const index = order.indexOf(segment);
    if (index < at) return null;
    at = index;
    out.get(segment)!.push(own);
  }
  return out;
}

/**
 * A part's whole page list after an edit of what the file shows of it: the pages the file
 * doesn't show (a case's own intro pages, its Carosello Chiusura) stay where they were, its
 * own intro pages first and the rest after; `old` itself when nothing changed.
 */
export function mergePart(old: readonly Page[], visibleBefore: readonly Page[], visibleNow: readonly Page[]): readonly Page[] {
  const wasShown = new Set(visibleBefore);
  const hidden = old.filter((p) => !wasShown.has(p));
  const next = [...hidden.filter((p) => p.role === "intro"), ...visibleNow, ...hidden.filter((p) => p.role !== "intro")];
  return next.length === old.length && next.every((p, i) => p === old[i]) ? old : next;
}

/** The own pages of part `partKey` among `segments`, in order (the intro's two runs together). */
export const ownPagesOf = (segments: readonly FileSegment[], partKey: string): Page[] =>
  segments.filter((s) => s.partKey === partKey).flatMap((s) => s.pages.map((p) => origin.get(p)?.page ?? p));

/**
 * An edit of the file (`next`, every format) as each changed part's new formats; `"moved"` when
 * a page would change part, `"empty"` when a format has no segment to hold the edit's pages.
 * `segments` and `formatsOf` are the file as shown before the edit.
 */
export function partsChanged(
  next: Readonly<Record<FormatId, readonly Page[]>>,
  shownNow: Readonly<Record<FormatId, readonly Page[]>>,
  segments: Readonly<Record<FormatId, readonly FileSegment[]>>,
  parts: readonly FilePartData[],
  formatsOf: (part: FilePartData) => Formats,
): Map<string, Formats> | "moved" | "empty" {
  const changed = new Map<string, Formats>();
  for (const formatId of FORMAT_IDS) {
    if (next[formatId] === shownNow[formatId]) continue;
    if (segments[formatId].length === 0) return "empty";
    const cut = splitFile(next[formatId], segments[formatId]);
    if (cut === null) return "moved";
    for (const part of parts) {
      const own = segments[formatId].filter((s) => s.partKey === part.key);
      if (own.length === 0) continue;
      const before = ownPagesOf(segments[formatId], part.key);
      const now = own.flatMap((s) => cut.get(s.key) ?? []);
      const formats = changed.get(part.key) ?? formatsOf(part);
      const merged = mergePart(formats[formatId], before, now);
      if (merged !== formats[formatId]) changed.set(part.key, { ...formats, [formatId]: merged });
    }
  }
  return changed;
}

/**
 * The file page key a page of `pages` (an edit's result) will have once shown: its own when it
 * has a segment already, else (a page made here) the segment of the page before it, or the
 * first segment's, as `splitFile` places it.
 */
export function fileKeyAfterEdit(pages: readonly Page[], pageKey: string, segments: readonly FileSegment[]): string {
  if (splitFilePageKey(pageKey) !== null) return pageKey;
  let segment = segments[0]?.key;
  for (const page of pages) {
    if (page.pageKey === pageKey) break;
    const split = splitFilePageKey(page.pageKey);
    if (split !== null && segments.some((s) => s.key === split.segment)) segment = split.segment;
  }
  return segment === undefined ? pageKey : filePageKey(segment, pageKey);
}
