import type { CaseClientInfo, CaseStudy, CaseStudyRevision } from "@/modules/case-study";
import type { CaseStudyDocument, Page } from "@/modules/generation";
import type { DetailsForm } from "@/modules/material";
import { brandPageCount } from "@/modules/rendering/brand/pages";
import { applyCollectionEdits, type CollectionEditSet } from "@/modules/rendering/collection-edits";
import { composeParts, type ComposePart } from "@/modules/rendering/compose";
import { bundleHash, collectionHash, contentHash, packHash } from "@/modules/rendering/application/content-hash";
import {
  bundleEntryName,
  collectionFileName,
  NOT_APPROVED,
  type ExportCollection,
  type ExportFormatId,
  type ExportPart,
  type ExportPartContent,
  type ExportSubject,
  type PackClient,
} from "@/modules/rendering/domain/export";
import { formatNotInRevision, requireFormat } from "@/modules/rendering/domain/formats";
import type { BoundValues } from "@/modules/rendering/templates/types";
import { err, ok, type Result } from "@/shared/result";

/** The reads an export starts from, through the case-study and material modules' index (wired in `server.ts` and `worker.ts`). */
export interface ExportSourceDeps {
  getCase(caseId: string): Promise<Result<CaseStudy>>;
  /** A case's or a client intro's live (approved) revision, never a working one. */
  getLiveRevision(subject: ExportSubject): Promise<Result<CaseStudyRevision | null>>;
  getClientInfoForCase(caseId: string): Promise<Result<CaseClientInfo>>;
  getDetailsForm(input: { caseId: string }): Promise<Result<DetailsForm>>;
}

/** What one case's export draws, read now: client info is live and read at request and at render time. */
export interface ExportSource {
  caseStudy: CaseStudy;
  revision: CaseStudyRevision;
  info: CaseClientInfo;
  form: DetailsForm;
  format: ExportFormatId;
  /** The format's pages in the live revision (never empty). */
  pages: readonly Page[];
  content: ExportPartContent;
  contentHash: string;
}

export const notApproved = (caseId: string) =>
  err({ code: NOT_APPROVED, message: "This case has no approved version to export.", details: { caseId } });

/**
 * The live approved revision of `caseId` in `format`, with the client's current info and
 * the case's bound fields, and their content hash. Errors: the case read's (`NOT_FOUND`
 * for an unknown or deleted case), `NOT_APPROVED` (no approved revision),
 * `FORMAT_NOT_IN_REVISION` (the revision has no pages in `format`), the other reads'.
 */
export async function readExportSource(deps: ExportSourceDeps, caseId: string, format: ExportFormatId): Promise<Result<ExportSource>> {
  const sources = await readExportSources(deps, caseId, [format]);
  return sources.ok ? ok(sources.value[0]) : sources;
}

/**
 * `readExportSource` for several formats of one case (Story 5.4), read once so every
 * format draws the same revision and the same client info. In the order given. Errors as
 * `readExportSource`, for the first format that fails its check.
 */
export async function readExportSources(
  deps: ExportSourceDeps,
  caseId: string,
  formats: readonly ExportFormatId[],
): Promise<Result<ExportSource[]>> {
  const found = await deps.getCase(caseId);
  if (!found.ok) return found;
  const caseStudy = found.value;
  const live = await deps.getLiveRevision({ kind: "case", id: caseStudy.id });
  if (!live.ok) return live;
  if (live.value === null) return notApproved(caseStudy.id);
  return sourcesOf(deps, caseStudy, live.value, formats);
}

/** `readExportSources` from a case already read and its live revision. */
async function sourcesOf(
  deps: ExportSourceDeps,
  caseStudy: CaseStudy,
  revision: CaseStudyRevision,
  formats: readonly ExportFormatId[],
): Promise<Result<ExportSource[]>> {
  const pagesOf: (readonly Page[])[] = [];
  for (const format of formats) {
    const entry = requireFormat(revision, format);
    if (!entry.ok) return entry;
    if (entry.value.pages.length === 0) return err(formatNotInRevision(format));
    pagesOf.push(entry.value.pages);
  }

  const [info, form] = await Promise.all([deps.getClientInfoForCase(caseStudy.id), deps.getDetailsForm({ caseId: caseStudy.id })]);
  if (!info.ok) return info;
  if (!form.ok) return form;
  const { brief } = info.value;
  const content: ExportPartContent = {
    part: { subject: { kind: "case", id: caseStudy.id }, revisionId: revision.id },
    template: revision.doc.template,
    client: {
      name: info.value.name,
      sector: info.value.industry?.label ?? "",
      description: info.value.description ?? "",
      logoId: info.value.logoId,
      results: brief.results.map(({ label, value }) => ({ label, value })),
      testimonial: brief.testimonialQuote === "" ? null : { quote: brief.testimonialQuote, author: brief.testimonialAuthor },
    },
    case: {
      year: caseStudy.year,
      services: [...caseStudy.businessLines],
      results: form.value.results.map(({ label, value }) => ({ label, value })),
      testimonial: form.value.testimonialQuote === "" ? null : { quote: form.value.testimonialQuote, author: form.value.testimonialAuthor },
    },
  };
  return ok(
    formats.map((format, i) => ({
      caseStudy,
      revision,
      info: info.value,
      form: form.value,
      format,
      pages: pagesOf[i],
      content,
      contentHash: contentHash([content], format),
    })),
  );
}

/**
 * The content hash of a bundle of `sources` (Story 5.4, all of one case, read together):
 * the formats with their own content hashes and the names of the files inside the ZIP.
 */
export function bundleHashOf(sources: readonly ExportSource[]): string {
  const { code, name } = sources[0].caseStudy;
  return bundleHash(
    sources.map(({ format, contentHash: hash }) => ({ format, contentHash: hash })),
    sources.map(({ format }) => bundleEntryName(code, name, format)),
  );
}

// ---------------------------------------------------------------------------
// What the worker draws (Stories 5.3, 5.9a): one format of a case, or of a client's pack.
// ---------------------------------------------------------------------------

/** One part as the worker draws it: a case history or a client's intro, with its approved revision. */
export interface DrawPart {
  kind: "case_history" | "client_intro";
  /** The case's id; null for an intro. */
  caseId: string | null;
  clientId: string;
  revision: CaseStudyRevision;
  content: ExportPartContent;
  /**
   * Story 5.11b, a collection's part: the revision's document with the collection's edits laid
   * over in the drawing's format (its words, its page order, its hidden pages left out). A copy:
   * the revision is never changed. Absent: the revision's document as it is.
   */
  doc?: CaseStudyDocument;
}

/** One file to draw: one format of a case (Story 5.3), a client's pack (Story 5.9a) or a collection (Story 5.10b). */
export interface ExportDrawing {
  format: ExportFormatId;
  /** In order: the pack's intro first, when it has one, then its cases; a collection's per client group. */
  parts: readonly DrawPart[];
  /** Composed with the pack rule (`composeParts`' `pack` option). */
  pack: boolean;
  /**
   * A collection's copies of MAC's pages (its words, its hidden ones left out), drawn instead of
   * the constants (`composeParts`' `brand` option). Absent: MAC's own pages.
   */
  brand?: readonly Page[];
  /** How many pages the file has (`composeParts`, MAC's pages in Presentazione included): what a printed file is checked against. */
  pageCount: number;
  contentHash: string;
  /** The code and name its files are named after: the case's, the client's, or (no code) the collection's. */
  code: string;
  name: string;
  /** The first part's client (a case's or a pack's only one); each part draws its own client's logo and files. */
  client: { id: string; logoId: string | null };
}

/** A case's source as a drawing: its one part, all its pages. */
export function drawingOfCase(source: ExportSource): ExportDrawing {
  return {
    format: source.format,
    parts: [
      { kind: "case_history", caseId: source.caseStudy.id, clientId: source.info.clientId, revision: source.revision, content: source.content },
    ],
    pack: false,
    // The case's pages, with MAC's intro and outro around them in Presentazione (`composeParts`).
    pageCount: source.pages.length + brandPageCount(source.format),
    contentHash: source.contentHash,
    code: source.caseStudy.code,
    name: source.caseStudy.name,
    client: { id: source.info.clientId, logoId: source.info.logoId },
  };
}

/** The content hash of a bundle of drawings of one subject (Stories 5.4, 5.9a), as `bundleHashOf`. */
export function bundleHashOfDrawings(drawings: readonly ExportDrawing[]): string {
  const { code, name } = drawings[0];
  return bundleHash(
    drawings.map(({ format, contentHash: hash }) => ({ format, contentHash: hash })),
    drawings.map(({ format }) => bundleEntryName(code, name, format)),
  );
}

/** The reads a client's pack starts from (Story 5.9a), besides a case's. */
export interface PackSourceDeps extends ExportSourceDeps {
  /** The client (`case-study.getClient`): its id, code and name. */
  getClient(clientId: string): Promise<Result<PackClient>>;
  /** The client's intro document (`case-study.getClientIntro`), or null when it has none. */
  getClientIntro(clientId: string): Promise<Result<{ id: string } | null>>;
  /** The client's approved, non-deleted cases in the client's order (`case-study.listClientCasesInOrder`, Story 4.12b). */
  listClientCasesInOrder(clientId: string): Promise<Result<readonly CaseStudy[]>>;
}

export const packNotApproved = (clientId: string) =>
  err({ code: NOT_APPROVED, message: "This client has no approved case to export.", details: { clientId } });

/** A client's pack as it stands now (Story 5.9a): what it is made of, without what its pages draw. */
export interface PackParts {
  client: PackClient;
  /** The client's intro with its approved revision, or null when it has none approved. */
  intro: { id: string; revision: CaseStudyRevision } | null;
  cases: readonly { caseStudy: CaseStudy; revision: CaseStudyRevision }[];
  /** The intro (when approved), then each case, in the client's order. */
  parts: readonly ExportPart[];
}

/**
 * What a client's pack is made of now (Story 5.9a): the client, its intro's live revision
 * (none when the intro is missing or not approved) and each of its approved, non-deleted
 * cases with its live revision, in the client's order (4.12b). Live revisions only, never a
 * working one. Errors: the client read's (`CLIENT_NOT_FOUND`), `NOT_APPROVED` (no approved
 * case), the other reads'.
 */
export async function readPackParts(deps: PackSourceDeps, clientId: string): Promise<Result<PackParts>> {
  const [found, listed, introFound] = await Promise.all([
    deps.getClient(clientId),
    deps.listClientCasesInOrder(clientId),
    deps.getClientIntro(clientId),
  ]);
  if (!found.ok) return found;
  if (!listed.ok) return listed;
  if (!introFound.ok) return introFound;
  const client: PackClient = { id: found.value.id, code: found.value.code, name: found.value.name };

  const lives = await Promise.all(listed.value.map((c) => deps.getLiveRevision({ kind: "case", id: c.id })));
  const cases: { caseStudy: CaseStudy; revision: CaseStudyRevision }[] = [];
  for (const [i, live] of lives.entries()) {
    // A case deleted since it was listed is left out like the others.
    if (!live.ok && live.error.code === "NOT_FOUND") continue;
    if (!live.ok) return live;
    const caseStudy = listed.value[i];
    // Deleted cases, another client's, and a case no longer approved are left out.
    if (live.value === null || caseStudy.deletedAt !== null || caseStudy.client.id.toLowerCase() !== client.id.toLowerCase()) continue;
    cases.push({ caseStudy, revision: live.value });
  }
  if (cases.length === 0) return packNotApproved(client.id);

  let intro: PackParts["intro"] = null;
  if (introFound.value !== null) {
    const live = await deps.getLiveRevision({ kind: "client_intro", id: introFound.value.id });
    if (!live.ok) return live;
    if (live.value !== null) intro = { id: introFound.value.id, revision: live.value };
  }
  const parts: ExportPart[] = [
    ...(intro === null ? [] : [{ subject: { kind: "client_intro" as const, id: intro.id }, revisionId: intro.revision.id }]),
    ...cases.map(({ caseStudy, revision }) => ({ subject: { kind: "case" as const, id: caseStudy.id }, revisionId: revision.id })),
  ];
  return ok({ client, intro, cases, parts });
}

/** Whether two lists of parts are the same subjects and revisions in the same order. */
export function sameParts(a: readonly ExportPart[], b: readonly ExportPart[]): boolean {
  const key = (p: ExportPart) => `${p.subject.kind}:${p.subject.id.toLowerCase()}:${p.revisionId.toLowerCase()}`;
  return a.length === b.length && a.every((p, i) => key(p) === key(b[i]));
}

/** What a client's pack draws in each format asked for (Story 5.9a). */
export interface PackSource extends PackParts {
  /** One per format, in the order given. */
  drawings: ExportDrawing[];
}

/** No bound values: `composeParts` reads only the documents (page counts). */
const NO_VALUES: BoundValues = {
  client: { name: "", sector: "", description: "", logoUrl: null, results: [], testimonial: null },
  case: { year: null, services: [], results: [], testimonial: null },
};

/**
 * A client's pack in `formats` (Story 5.9a; one or more), read once so every format draws
 * the same revisions and client info: the intro's `intro` pages, each approved case without
 * its own intro pages (and, in Carosello, its own Chiusura), the intro's `outro` pages once;
 * with no approved intro, each case with all its pages. Page numbers run on (`composeParts`
 * with `pack`). Each format's content hash covers the client and every part's subject,
 * approved revision and bound values. Errors: as `readPackParts`, and
 * `FORMAT_NOT_IN_REVISION` when any part has no pages in a format, the other reads'.
 */
export async function readPackSources(deps: PackSourceDeps, clientId: string, formats: readonly ExportFormatId[]): Promise<Result<PackSource>> {
  const read = await readPackParts(deps, clientId);
  if (!read.ok) return read;
  const pack = read.value;

  const perCase: ExportSource[][] = [];
  for (const { caseStudy, revision } of pack.cases) {
    const sources = await sourcesOf(deps, caseStudy, revision, formats);
    if (!sources.ok) return sources;
    perCase.push(sources.value);
  }
  if (pack.intro !== null) {
    for (const format of formats) {
      const entry = requireFormat(pack.intro.revision, format);
      if (!entry.ok) return entry;
      if (entry.value.pages.length === 0) return err(formatNotInRevision(format));
    }
  }

  const drawings = formats.map((format, f): ExportDrawing => {
    const cases = perCase.map((sources): DrawPart => {
      const source = sources[f];
      return { kind: "case_history", caseId: source.caseStudy.id, clientId: source.info.clientId, revision: source.revision, content: source.content };
    });
    // The intro draws the client's values (client info is live) and binds no case.
    const { client } = cases[0].content;
    const intro: DrawPart[] =
      pack.intro === null
        ? []
        : [
            {
              kind: "client_intro",
              caseId: null,
              clientId: cases[0].clientId,
              revision: pack.intro.revision,
              content: {
                part: { subject: { kind: "client_intro", id: pack.intro.id }, revisionId: pack.intro.revision.id },
                template: pack.intro.revision.doc.template,
                client,
                case: { year: null, services: [], results: [], testimonial: null },
              },
            },
          ];
    const parts = [...intro, ...cases];
    const composed = composeParts(
      parts.map((p) => composePartOf(p)),
      format,
      { pack: true },
    );
    const contents = parts.map((p) => p.content);
    return {
      format,
      parts,
      pack: true,
      pageCount: composed.segments.reduce((sum, segment) => sum + segment.pages.length, 0),
      contentHash: packHash(pack.client, contents, format),
      code: pack.client.code,
      name: pack.client.name,
      client: { id: cases[0].clientId, logoId: cases[0].content.client.logoId },
    };
  });
  return ok({ ...pack, drawings });
}

/** A drawn part as `composeParts` takes it (`assets` and `values` filled in by the caller that renders). */
export function composePartOf(part: DrawPart, values: BoundValues = NO_VALUES, assets: ComposePart["assets"] = {}): ComposePart {
  const base = { clientId: part.clientId.toLowerCase(), doc: part.doc ?? part.revision.doc, assets, values };
  return part.kind === "case_history" ? { ...base, kind: "case_history", caseId: part.caseId ?? "" } : { ...base, kind: "client_intro" };
}

// ---------------------------------------------------------------------------
// A collection (Story 5.10b)
// ---------------------------------------------------------------------------

/** One case of a collection as its module lists it, in the collection's order (each client's cases together). */
export interface CollectionEntry {
  caseId: string;
  clientId: string;
}

/** The reads a collection's file starts from (Story 5.10b), besides a case's. */
export interface CollectionSourceDeps extends ExportSourceDeps {
  /** The live collection (`collection.getCollection`): its id, name and cases in order. `COLLECTION_NOT_FOUND` when unknown or deleted. */
  getCollection(collectionId: string): Promise<Result<{ id: string; name: string; items: readonly CollectionEntry[] }>>;
  /** The client's intro document (`case-study.getClientIntro`), or null when it has none. */
  getClientIntro(clientId: string): Promise<Result<{ id: string } | null>>;
  /**
   * Story 5.11b, the collection's own edits (`collection.getCollectionEdits`): its words for free
   * texts, hidden pages and page orders, keyed `case:{caseId}` / `client_intro:{clientId}`.
   */
  getCollectionEdits(collectionId: string): Promise<Result<CollectionEditSet>>;
}

export const collectionNotApproved = (collectionId: string) =>
  err({ code: NOT_APPROVED, message: "This collection has no approved case to export.", details: { collectionId } });

/** One client's group of a collection as it stands now: its available cases and, with 2 or more, its approved intro. */
export interface CollectionGroupParts {
  clientId: string;
  /** The client's intro with its approved revision: only when 2 or more of its cases are available and the intro is approved. */
  intro: { id: string; revision: CaseStudyRevision } | null;
  cases: readonly { caseStudy: CaseStudy; revision: CaseStudyRevision }[];
}

/** A collection as it stands now (Story 5.10b): what its file is made of, without what its pages draw. */
export interface CollectionParts {
  collection: ExportCollection;
  /** In the collection's order; a group with no available case is left out. */
  groups: readonly CollectionGroupParts[];
  /** Per group: its intro (when it has one), then its cases. */
  parts: readonly ExportPart[];
  /** The collection's cases left out: no approved revision any more, or deleted ("Non disponibile"). */
  unavailable: number;
  /** Story 5.11b: the collection's own edits, read with it (laid over per format by `readCollectionSources`). */
  edits: CollectionEditSet;
}

/**
 * What a collection's file is made of now (Story 5.10b): the collection, and per client group
 * in its order, each available case with its live approved revision (a case with none, or
 * deleted, is left out: "Non disponibile") and, when 2 or more of the group's cases are
 * available, the client's approved intro (none when it is missing or not approved). Live
 * revisions only, never a working one. Errors: the collection read's (`COLLECTION_NOT_FOUND`),
 * `NOT_APPROVED` (no available case), the other reads'.
 */
export async function readCollectionParts(deps: CollectionSourceDeps, collectionId: string): Promise<Result<CollectionParts>> {
  const [found, edits] = await Promise.all([deps.getCollection(collectionId), deps.getCollectionEdits(collectionId)]);
  if (!found.ok) return found;
  if (!edits.ok) return edits;
  const collection: ExportCollection = { id: found.value.id, name: found.value.name };
  const { items } = found.value;

  const read = await Promise.all(
    items.map(async (item) => {
      const [c, live] = await Promise.all([deps.getCase(item.caseId), deps.getLiveRevision({ kind: "case", id: item.caseId })]);
      return { c, live };
    }),
  );
  const groups: { clientId: string; cases: { caseStudy: CaseStudy; revision: CaseStudyRevision }[] }[] = [];
  for (const { c, live } of read) {
    // A case deleted since it was listed is left out like the others.
    if ((!c.ok && c.error.code === "NOT_FOUND") || (!live.ok && live.error.code === "NOT_FOUND")) continue;
    if (!c.ok) return c;
    if (!live.ok) return live;
    if (live.value === null || c.value.deletedAt !== null) continue;
    // Each client's cases together, where its first case is (the collection keeps them so).
    const clientId = c.value.client.id.toLowerCase();
    const group = groups.find((g) => g.clientId === clientId);
    const entry = { caseStudy: c.value, revision: live.value };
    if (group === undefined) groups.push({ clientId, cases: [entry] });
    else group.cases.push(entry);
  }
  const available = groups.reduce((n, g) => n + g.cases.length, 0);
  if (available === 0) return collectionNotApproved(collection.id);

  const withIntros: CollectionGroupParts[] = [];
  for (const group of groups) {
    let intro: CollectionGroupParts["intro"] = null;
    // A client's intro and closing wrap its cases only with 2 or more of them (owner, 2026-11-10).
    if (group.cases.length >= 2) {
      const introFound = await deps.getClientIntro(group.clientId);
      if (!introFound.ok) return introFound;
      if (introFound.value !== null) {
        const live = await deps.getLiveRevision({ kind: "client_intro", id: introFound.value.id });
        if (!live.ok) return live;
        if (live.value !== null) intro = { id: introFound.value.id, revision: live.value };
      }
    }
    withIntros.push({ ...group, intro });
  }
  const parts: ExportPart[] = withIntros.flatMap((group) => [
    ...(group.intro === null ? [] : [{ subject: { kind: "client_intro" as const, id: group.intro.id }, revisionId: group.intro.revision.id }]),
    ...group.cases.map(({ caseStudy, revision }) => ({ subject: { kind: "case" as const, id: caseStudy.id }, revisionId: revision.id })),
  ]);
  return ok({ collection, groups: withIntros, parts, unavailable: items.length - available, edits: edits.value });
}

/** What a collection draws in each format asked for (Story 5.10b). */
export interface CollectionSource extends CollectionParts {
  /** One per format, in the order given (a skipped format left out). */
  drawings: ExportDrawing[];
}

/**
 * A collection in `formats` (Story 5.10b; one or more), read once so every format draws the
 * same revisions and client info. Per client group in the collection's order: with 2 or more
 * available cases and an approved intro, the intro's `intro` pages, each case without its own
 * intro pages (and, in Carosello, its own Chiusura), the intro's `outro` pages once; otherwise
 * each case with all its pages (`composeParts`, default mode). Page numbers run on. Each
 * format's content hash covers the collection's id and name and every part's subject,
 * approved revision and bound values. Errors: as `readCollectionParts`, and
 * `FORMAT_NOT_IN_REVISION` when any part has no pages in a format (with `skipMissingFormats`
 * that format is left out of `drawings` instead), the other reads'.
 */
export async function readCollectionSources(
  deps: CollectionSourceDeps,
  collectionId: string,
  formats: readonly ExportFormatId[],
  options: { skipMissingFormats?: boolean } = {},
): Promise<Result<CollectionSource>> {
  const read = await readCollectionParts(deps, collectionId);
  if (!read.ok) return read;
  const parts = read.value;

  // With `skipMissingFormats` (the status read), a format some part has no pages in is left out
  // instead of failing the read: every format's hash comes from this one read.
  const revisions = parts.groups.flatMap((group) => [...(group.intro === null ? [] : [group.intro.revision]), ...group.cases.map((c) => c.revision)]);
  const hasPages = (revision: CaseStudyRevision, format: ExportFormatId) => {
    const entry = requireFormat(revision, format);
    return entry.ok && entry.value.pages.length > 0;
  };
  const drawn = options.skipMissingFormats === true ? formats.filter((format) => revisions.every((r) => hasPages(r, format))) : formats;

  const perGroup: ExportSource[][][] = [];
  for (const group of parts.groups) {
    const cases: ExportSource[][] = [];
    for (const { caseStudy, revision } of group.cases) {
      const sources = await sourcesOf(deps, caseStudy, revision, drawn);
      if (!sources.ok) return sources;
      cases.push(sources.value);
    }
    if (group.intro !== null) {
      for (const format of drawn) {
        if (!hasPages(group.intro.revision, format)) return err(formatNotInRevision(format));
      }
    }
    perGroup.push(cases);
  }

  const drawings = drawn.map((format, f): ExportDrawing => {
    const drawParts = parts.groups.flatMap((group, g): DrawPart[] => {
      const cases = perGroup[g].map((sources): DrawPart => {
        const source = sources[f];
        return { kind: "case_history", caseId: source.caseStudy.id, clientId: source.info.clientId, revision: source.revision, content: source.content };
      });
      if (group.intro === null) return cases;
      // The intro draws its client's values (client info is live) and binds no case.
      const intro: DrawPart = {
        kind: "client_intro",
        caseId: null,
        clientId: cases[0].clientId,
        revision: group.intro.revision,
        content: {
          part: { subject: { kind: "client_intro", id: group.intro.id }, revisionId: group.intro.revision.id },
          template: group.intro.revision.doc.template,
          client: cases[0].content.client,
          case: { year: null, services: [], results: [], testimonial: null },
        },
      };
      return [intro, ...cases];
    });
    // Story 5.11b: the collection's edits laid over each part, by the rules its page uses; each
    // part then draws its edited copy (`doc`), and the hash covers the edits that take effect.
    const applied = applyCollectionEdits(
      drawParts.map((p) => composePartOf(p)),
      format,
      parts.edits,
    );
    const edited = drawParts.map((p, i): DrawPart => ({ ...p, doc: applied.shownParts[i].doc }));
    const first = edited.find((p) => p.kind === "case_history") ?? edited[0];
    return {
      format,
      parts: edited,
      pack: false,
      brand: applied.brand,
      pageCount: applied.file.segments.reduce((sum, segment) => sum + segment.pages.length, 0),
      contentHash: collectionHash(
        parts.collection,
        drawParts.map((p) => p.content),
        format,
        applied.effective,
      ),
      code: "",
      name: collectionFileName(parts.collection.name),
      client: { id: first.clientId, logoId: first.content.client.logoId },
    };
  });
  return ok({ ...parts, drawings });
}
