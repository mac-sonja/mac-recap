import type { Actor } from "@/modules/access";
import {
  createWorkingRevisionInputSchema,
  revisionSubjectSchema,
  saveRevisionDocInputSchema,
  type Revision,
  type RevisionSubject,
} from "@/modules/case-study/domain/revision";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
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

/**
 * Every asset id a document references: media and backgrounds (`assetId`), animations
 * (`assetIds`) and texts' `{ kind: "asset", id }` source refs. Walks the JSON so a new
 * element type with an asset is covered without a change here.
 */
export function referencedAssetIds(doc: unknown): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.assetId === "string") found.add(record.assetId.toLowerCase());
    if (Array.isArray(record.assetIds)) for (const id of record.assetIds) if (typeof id === "string") found.add(id.toLowerCase());
    if (record.kind === "asset" && typeof record.id === "string") found.add(record.id.toLowerCase());
    for (const child of Object.values(record)) walk(child);
  };
  walk(doc);
  return found;
}

/**
 * The ids of a case's non-deleted assets (the material module's `liveAssetIds`, passed in:
 * material imports this module, never the reverse).
 */
export type CaseAssetIds = (caseId: string) => Promise<Result<readonly string[]>>;

export interface SaveRevisionDocDeps {
  revisions: RevisionRepository;
  cases: Pick<CaseStudyRepository, "findById">;
  clients: Pick<ClientRepository, "listAssets">;
  caseAssetIds: CaseAssetIds;
}

/** The assets a revision of `caseId` may newly reference: the case's live files and its client's files, lowercased. */
async function allowedAssetIds(deps: SaveRevisionDocDeps, caseId: string): Promise<Result<Set<string>>> {
  const owner = await deps.cases.findById(caseId);
  if (!owner.ok) return owner;
  if (owner.value === null) return err({ code: "NOT_FOUND", message: "No case study with this id.", details: { caseId } });
  const [ofCase, ofClient] = await Promise.all([deps.caseAssetIds(caseId), deps.clients.listAssets(owner.value.client.id)]);
  if (!ofCase.ok) return ofCase;
  if (!ofClient.ok) return ofClient;
  return ok(new Set([...ofCase.value, ...ofClient.value.map((asset) => asset.id)].map((id) => id.toLowerCase())));
}

/**
 * Saves an edited `doc` of a case's head revision (Story 4.3a) by compare-and-set on
 * `version`. The revision must be `revisionId` of `caseId` (else `NOT_FOUND`), and `doc`
 * must pass `generation.validateNewDocument`.
 *
 * The media guardrail (Story 4.5a): an asset neither the stored `doc` nor `generatedDoc`
 * references must be a non-deleted file of this case or a file of its client
 * (`ASSET_NOT_ALLOWED`, naming up to 10). References the revision already has are kept even
 * once their file is deleted, so the document stays editable (an undo or Pagine di default
 * may bring a generated one back); approval reports them (`MATERIAL_MISSING`). The
 * asset lists are read only when something is added. The caller has authorized the actor
 * to `edit`; the database checks the case is `in_review`.
 */
export function makeSaveRevisionDoc(deps: SaveRevisionDocDeps) {
  return async function saveRevisionDoc(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
    const parsed = parseInput(saveRevisionDocInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, revisionId, doc, expectedVersion } = parsed.value;
    const valid = validateNewDocument(doc);
    if (!valid.ok) return valid;

    const found = await deps.revisions.findById(revisionId);
    if (!found.ok) return found;
    if (found.value === null || found.value.caseId?.toLowerCase() !== caseId) {
      return err({ code: "NOT_FOUND", message: "No revision of this case study with this id.", details: { caseId, revisionId } });
    }
    const current = upgraded(found.value);
    if (!current.ok) return current;

    // What the revision uses now or was generated with: Pagine di default and undo bring generated refs back.
    const kept = new Set([...referencedAssetIds(current.value.doc), ...referencedAssetIds(current.value.generatedDoc)]);
    const added = [...referencedAssetIds(valid.value)].filter((id) => !kept.has(id));
    if (added.length > 0) {
      const allowed = await allowedAssetIds(deps, caseId);
      if (!allowed.ok) return allowed;
      const foreign = added.filter((id) => !allowed.value.has(id));
      if (foreign.length > 0) {
        return err({
          code: "ASSET_NOT_ALLOWED",
          message: "The document references a file that is not this case's or its client's.",
          details: { revisionId, assetIds: foreign.slice(0, 10) },
        });
      }
    }

    const saved = await deps.revisions.saveDoc({ revisionId, doc: valid.value, expectedVersion, actorId: actor.id });
    if (!saved.ok) return saved;
    return upgraded(saved.value);
  };
}
