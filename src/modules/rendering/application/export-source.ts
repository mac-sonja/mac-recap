import type { CaseClientInfo, CaseStudy, CaseStudyRevision } from "@/modules/case-study";
import type { Page } from "@/modules/generation";
import type { DetailsForm } from "@/modules/material";
import { composeParts, type ComposePart } from "@/modules/rendering/compose";
import { bundleHash, contentHash, packHash } from "@/modules/rendering/application/content-hash";
import {
  bundleEntryName,
  NOT_APPROVED,
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
}

/** One file to draw: one format of a case (Story 5.3) or of a client's pack (Story 5.9a). */
export interface ExportDrawing {
  format: ExportFormatId;
  /** In order: the pack's intro first, when it has one, then its cases. */
  parts: readonly DrawPart[];
  /** Composed with the pack rule (`composeParts`' `pack` option). */
  pack: boolean;
  /** How many pages the file has (`composeParts`): what a printed file is checked against. */
  pageCount: number;
  contentHash: string;
  /** The code and name its files are named after: the case's, or the client's. */
  code: string;
  name: string;
  /** The client whose logo the pages draw. */
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
    pageCount: source.pages.length,
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
    const composed = composeParts(parts.map(composePartOf), format, { pack: true });
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
  const base = { clientId: part.clientId.toLowerCase(), doc: part.revision.doc, assets, values };
  return part.kind === "case_history" ? { ...base, kind: "case_history", caseId: part.caseId ?? "" } : { ...base, kind: "client_intro" };
}
