import type { CaseClientInfo, CaseStudy, CaseStudyRevision } from "@/modules/case-study";
import type { Page } from "@/modules/generation";
import type { DetailsForm } from "@/modules/material";
import { contentHash } from "@/modules/rendering/application/content-hash";
import { NOT_APPROVED, type ExportFormatId, type ExportPartContent } from "@/modules/rendering/domain/export";
import { formatNotInRevision, requireFormat } from "@/modules/rendering/domain/formats";
import { err, ok, type Result } from "@/shared/result";

/** The reads an export starts from, through the case-study and material modules' index (wired in `server.ts` and `worker.ts`). */
export interface ExportSourceDeps {
  getCase(caseId: string): Promise<Result<CaseStudy>>;
  getLiveRevision(subject: { kind: "case"; id: string }): Promise<Result<CaseStudyRevision | null>>;
  getClientInfoForCase(caseId: string): Promise<Result<CaseClientInfo>>;
  getDetailsForm(input: { caseId: string }): Promise<Result<DetailsForm>>;
}

/** What one case's export draws, read now: client info is live and read at request and at render time. */
export interface ExportSource {
  caseStudy: CaseStudy;
  revision: CaseStudyRevision;
  info: CaseClientInfo;
  form: DetailsForm;
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
  const found = await deps.getCase(caseId);
  if (!found.ok) return found;
  const caseStudy = found.value;
  const live = await deps.getLiveRevision({ kind: "case", id: caseStudy.id });
  if (!live.ok) return live;
  if (live.value === null) return notApproved(caseStudy.id);
  const revision = live.value;
  const entry = requireFormat(revision, format);
  if (!entry.ok) return entry;
  if (entry.value.pages.length === 0) return err(formatNotInRevision(format));

  const [info, form] = await Promise.all([deps.getClientInfoForCase(caseStudy.id), deps.getDetailsForm({ caseId: caseStudy.id })]);
  if (!info.ok) return info;
  if (!form.ok) return form;
  const { brief } = info.value;
  const content: ExportPartContent = {
    part: { subject: { kind: "case", id: caseStudy.id }, revisionId: revision.id },
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
  return ok({
    caseStudy,
    revision,
    info: info.value,
    form: form.value,
    pages: entry.value.pages,
    content,
    contentHash: contentHash([content], format),
  });
}
