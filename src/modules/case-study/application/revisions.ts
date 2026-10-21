import type { Actor } from "@/modules/access";
import {
  createWorkingRevisionInputSchema,
  revisionSubjectSchema,
  type Revision,
  type RevisionSubject,
} from "@/modules/case-study/domain/revision";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { RevisionRepository } from "@/modules/case-study/ports/revision-repository";
import { upgrade, validateNewDocument, type CaseStudyDocument } from "@/modules/generation";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";

/** A revision with both documents at the current schema version (upgraded in memory on read). */
export type CaseStudyRevision = Revision<CaseStudyDocument>;

/**
 * Passes both documents through `generation.upgrade`. The row is never written
 * back: an old revision stays as it was stored. A document that does not
 * upgrade keeps its code (`DOCUMENT_SCHEMA_UNSUPPORTED`, `DOCUMENT_INVALID`),
 * naming the revision.
 */
function upgraded(revision: Revision): Result<CaseStudyRevision> {
  const doc = upgrade(revision.doc);
  if (!doc.ok) return err({ ...doc.error, details: { revisionId: revision.id, document: "doc", cause: doc.error.details } });
  const generatedDoc = upgrade(revision.generatedDoc);
  if (!generatedDoc.ok) {
    return err({ ...generatedDoc.error, details: { revisionId: revision.id, document: "generatedDoc", cause: generatedDoc.error.details } });
  }
  return ok({ ...revision, doc: doc.value, generatedDoc: generatedDoc.value });
}

const notFound = (id: unknown) => err({ code: "NOT_FOUND", message: "No case study with this id.", details: { id } });

/**
 * Creates a `working` revision of a case and makes it the head (compare-and-set
 * on `headVersion`), the one write every later writer (test draft, generator,
 * Epic 4 edits) goes through. `doc` must pass `generation.validateNewDocument`
 * before anything is written. The caller has authorized the actor.
 */
export function makeCreateWorkingRevision(deps: { cases: CaseStudyRepository; revisions: RevisionRepository }) {
  return async function createWorkingRevision(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
    const parsed = parseInput(createWorkingRevisionInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, doc, manifest, meta, expectedHeadVersion } = parsed.value;
    const valid = validateNewDocument(doc);
    if (!valid.ok) return valid;

    const created = await deps.revisions.createWorking({
      caseId,
      doc: valid.value,
      manifest,
      meta,
      expectedHeadVersion,
      actorId: actor.id,
    });
    if (!created.ok) return created;
    return upgraded(created.value);
  };
}

type Pointer = "approvedRevisionId" | "headRevisionId";

function makeSubjectRead(pointer: Pointer, deps: { cases: CaseStudyRepository; revisions: RevisionRepository }) {
  return async function read(subject: unknown): Promise<Result<CaseStudyRevision | null>> {
    const parsed = parseInput(revisionSubjectSchema, subject);
    if (!parsed.ok) return parsed;
    const target: RevisionSubject = parsed.value;
    if (target.kind !== "case") {
      return err({ code: "SUBJECT_NOT_SUPPORTED", message: "Client intro revisions arrive with Story 3.9.", details: { kind: target.kind } });
    }

    const found = await deps.cases.findById(target.id);
    if (!found.ok) return found;
    // Soft-deleted cases are skipped, like every other read.
    if (found.value === null) return notFound(target.id);
    const revisionId = found.value[pointer];
    if (revisionId === null) return ok(null);

    const revision = await deps.revisions.findById(revisionId);
    if (!revision.ok) return revision;
    const pointed = revision.value;
    const valid =
      pointed !== null &&
      pointed.caseId?.toLowerCase() === target.id &&
      (pointer !== "approvedRevisionId" || pointed.status === "approved");
    if (!valid) {
      log.error(`revision pointer invalid: ${pointer} -> ${revisionId}`, { caseId: target.id });
      return err({
        code: "REVISION_POINTER_INVALID",
        message: "The case study points at a revision that is missing, not its own, or not approved.",
        details: { id: target.id, revisionId },
      });
    }
    return upgraded(pointed);
  };
}

/** The approved revision of a subject (what is live), or `null` when none is approved. */
export const makeGetLiveRevision = (deps: { cases: CaseStudyRepository; revisions: RevisionRepository }) =>
  makeSubjectRead("approvedRevisionId", deps);

/** The head revision of a subject (what is edited next), or `null` when it has none. */
export const makeGetEditableRevision = (deps: { cases: CaseStudyRepository; revisions: RevisionRepository }) =>
  makeSubjectRead("headRevisionId", deps);
