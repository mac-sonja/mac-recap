import type { Actor } from "@/modules/access";
import {
  approveInputSchema,
  createWorkingRevisionInputSchema,
  discardHeadInputSchema,
  forkHeadInputSchema,
  type ForkedHead,
  revisionSubjectSchema,
  saveRevisionDocInputSchema,
  type Revision,
  type RevisionSubject,
} from "@/modules/case-study/domain/revision";
import { approveIntroInputSchema, saveIntroRevisionDocInputSchema } from "@/modules/case-study/domain/client-intro";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { ClientIntroRepository } from "@/modules/case-study/ports/client-intro-repository";
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
export function upgraded(revision: Revision): Result<CaseStudyRevision> {
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

/** What a subject read needs: the cases, the revisions and (Story 3.11) the client intros. */
export interface SubjectReadDeps {
  cases: Pick<CaseStudyRepository, "findById">;
  revisions: Pick<RevisionRepository, "findById">;
  intros: Pick<ClientIntroRepository, "findById">;
}

function makeSubjectRead(pointer: Pointer, deps: SubjectReadDeps) {
  return async function read(subject: unknown): Promise<Result<CaseStudyRevision | null>> {
    const parsed = parseInput(revisionSubjectSchema, subject);
    if (!parsed.ok) return parsed;
    const target: RevisionSubject = parsed.value;

    // A case, or (Story 3.11) a client intro; soft-deleted cases and deleted clients' intros are skipped, like every other read.
    const owner = target.kind === "case" ? await deps.cases.findById(target.id) : await deps.intros.findById(target.id);
    if (!owner.ok) return owner;
    if (owner.value === null) {
      return target.kind === "case" ? notFound(target.id) : err({ code: "NOT_FOUND", message: "No client intro with this id.", details: { id: target.id } });
    }
    const revisionId = owner.value[pointer];
    if (revisionId === null) return ok(null);

    const revision = await deps.revisions.findById(revisionId);
    if (!revision.ok) return revision;
    const pointed = revision.value;
    const ownId = target.kind === "case" ? pointed?.caseId : pointed?.clientIntroId;
    const valid =
      pointed !== null &&
      ownId?.toLowerCase() === target.id &&
      (pointer !== "approvedRevisionId" || pointed.status === "approved");
    if (!valid) {
      log.error(`revision pointer invalid: ${pointer} -> ${revisionId}`, target.kind === "case" ? { caseId: target.id } : { clientIntroId: target.id });
      return err({
        code: "REVISION_POINTER_INVALID",
        message: `The ${target.kind === "case" ? "case study" : "client intro"} points at a revision that is missing, not its own, or not approved.`,
        details: { id: target.id, revisionId },
      });
    }
    return upgraded(pointed);
  };
}

/** The approved revision of a subject (what is live), or `null` when none is approved. */
export const makeGetLiveRevision = (deps: SubjectReadDeps) => makeSubjectRead("approvedRevisionId", deps);

/** The head revision of a subject (what is edited next), or `null` when it has none. */
export const makeGetEditableRevision = (deps: SubjectReadDeps) => makeSubjectRead("headRevisionId", deps);

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
  return assetsOfCase(deps, caseId, owner.value.client.id);
}

/** The case's live files and its client `clientId`'s files, lowercased. */
async function assetsOfCase(deps: SaveRevisionDocDeps, caseId: string, clientId: string): Promise<Result<Set<string>>> {
  const [ofCase, ofClient] = await Promise.all([deps.caseAssetIds(caseId), deps.clients.listAssets(clientId)]);
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
 * to `edit`; the database checks the case is `in_review`, or approved with a working copy
 * as its head (Story 4.9: the approved revision itself is never written).
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

/**
 * Approves a case (Story 4.8, C39): a person's call, never automatic or in bulk. The
 * revision must be `revisionId` of `caseId` (else `NOT_FOUND`). Every format of its
 * `doc` must be in `overflow` and `false` (else `OVERFLOW_NOT_CLEARED`, naming them);
 * every file it references (media, backgrounds, animations, texts' sources) must be a
 * live file of the case or a file of its client (else `MATERIAL_MISSING`, naming up to
 * 10). Then, in one transaction, the revision and the case become `approved` with
 * `approved_revision_id` and the events (`STALE_REVISION`, `STALE_HEAD`,
 * `CASE_NOT_APPROVABLE`, `REVISION_NOT_WRITABLE` from the database). The caller has
 * authorized the actor to `approve`.
 *
 * Story 4.9: on an approved case the same checks run on its working copy (the head), which
 * then becomes the approved revision while the previous one is superseded (**Aggiorna la
 * versione approvata**); the case stays approved, with no path back to Da approvare.
 */
export function makeApprove(deps: SaveRevisionDocDeps) {
  return async function approve(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
    const parsed = parseInput(approveInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, revisionId, expectedRevisionVersion, expectedHeadVersion, overflow } = parsed.value;

    const found = await deps.revisions.findById(revisionId);
    if (!found.ok) return found;
    if (found.value === null || found.value.caseId?.toLowerCase() !== caseId) {
      return err({ code: "NOT_FOUND", message: "No revision of this case study with this id.", details: { caseId, revisionId } });
    }
    // The checks below read this version: a newer one was not the one measured.
    if (found.value.version !== expectedRevisionVersion) {
      return err({ code: "STALE_REVISION", message: "The revision changed since it was measured.", details: { revisionId, version: found.value.version } });
    }
    const current = upgraded(found.value);
    if (!current.ok) return current;

    const formats = Object.keys(current.value.doc.formats);
    const notCleared = formats.filter((id) => overflow[id] !== false);
    if (notCleared.length > 0) {
      return err({ code: "OVERFLOW_NOT_CLEARED", message: "A format overflows, or was not measured.", details: { revisionId, formats: notCleared } });
    }

    const owner = await deps.cases.findById(caseId);
    if (!owner.ok) return owner;
    if (owner.value === null) return err({ code: "NOT_FOUND", message: "No case study with this id.", details: { caseId } });
    const allowed = await assetsOfCase(deps, caseId, owner.value.client.id);
    if (!allowed.ok) return allowed;
    const missing = [...referencedAssetIds(current.value.doc)].filter((id) => !allowed.value.has(id));
    if (missing.length > 0) {
      return err({ code: "MATERIAL_MISSING", message: "The revision references a file that is no longer there.", details: { revisionId, assetIds: missing.slice(0, 10) } });
    }

    // Approvato is terminal: an approved case's copy replaces its approved version (Story 4.9), the case stays approved.
    const approval = { caseId, revisionId, expectedRevisionVersion, expectedHeadVersion, actorId: actor.id };
    const approved = owner.value.status === "approved" ? await deps.revisions.updateApproved(approval) : await deps.revisions.approve(approval);
    if (!approved.ok) return approved;
    return upgraded(approved.value);
  };
}

/**
 * Forks the head of an approved case (Story 4.9): the first edit's working copy of the
 * approved revision, made the head by compare-and-set on `headVersion`; or the copy that
 * already exists, with nothing written (idempotent). Live reads keep returning the approved
 * revision. Returns the copy's id and `version` and the case's `headVersion` after the call.
 * The caller has authorized the actor to `edit`. Errors: `INVALID_INPUT`, then the
 * repository's (`NOT_FOUND`, `CASE_NOT_EDITABLE`, `REVISION_NOT_WRITABLE`, `STALE_HEAD`).
 */
export function makeForkHead(deps: { revisions: RevisionRepository }) {
  return async function forkHead(actor: Actor, input: unknown): Promise<Result<ForkedHead>> {
    const parsed = parseInput(forkHeadInputSchema, input);
    if (!parsed.ok) return parsed;
    const forked = await deps.revisions.forkHead({ ...parsed.value, actorId: actor.id });
    if (!forked.ok) return forked;
    return ok({ revisionId: forked.value.revision.id, version: forked.value.revision.version, headVersion: forked.value.headVersion });
  };
}

/**
 * Discards an approved case's working copy (Story 4.9): the copy `superseded` and the head
 * back on the approved revision, by compare-and-set on `headVersion`. The case stays
 * approved. Returns the approved revision. The caller has authorized the actor to
 * `discard`. Errors: `INVALID_INPUT`, then the repository's (`NOT_FOUND`, `STALE_HEAD`,
 * `CASE_NOT_EDITABLE`, `REVISION_NOT_WRITABLE`).
 */
export function makeDiscardHead(deps: { revisions: RevisionRepository }) {
  return async function discardHead(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
    const parsed = parseInput(discardHeadInputSchema, input);
    if (!parsed.ok) return parsed;
    const discarded = await deps.revisions.discardHead({ ...parsed.value, actorId: actor.id });
    if (!discarded.ok) return discarded;
    return upgraded(discarded.value);
  };
}

// ---------------------------------------------------------------------------
// Client intros (Story 4.11a)
// ---------------------------------------------------------------------------

export interface IntroRevisionDeps {
  revisions: Pick<RevisionRepository, "findById">;
  intros: Pick<ClientIntroRepository, "findById" | "saveDoc" | "approve">;
  cases: Pick<CaseStudyRepository, "list">;
  clients: Pick<ClientRepository, "listAssets">;
  caseAssetIds: CaseAssetIds;
}

const introRevisionNotFound = (clientIntroId: string, revisionId: string) =>
  err({ code: "NOT_FOUND", message: "No revision of this client intro with this id.", details: { clientIntroId, revisionId } });

/**
 * The assets an intro of client `clientId` may reference: the client's files and the live
 * files of each of the client's non-deleted cases ("Dalle sue case"), lowercased.
 */
async function assetsOfIntro(deps: IntroRevisionDeps, clientId: string): Promise<Result<Set<string>>> {
  const [ofClient, cases] = await Promise.all([deps.clients.listAssets(clientId), deps.cases.list({ clientId })]);
  if (!ofClient.ok) return ofClient;
  if (!cases.ok) return cases;
  const ofCases = await Promise.all(cases.value.map((c) => deps.caseAssetIds(c.id)));
  const ids = ofClient.value.map((asset) => asset.id);
  for (const listed of ofCases) {
    if (!listed.ok) return listed;
    ids.push(...listed.value);
  }
  return ok(new Set(ids.map((id) => id.toLowerCase())));
}

/** The intro `clientIntroId` and its revision `revisionId` (else `NOT_FOUND`), the revision upgraded. */
async function introRevisionOf(deps: IntroRevisionDeps, clientIntroId: string, revisionId: string) {
  const [intro, found] = await Promise.all([deps.intros.findById(clientIntroId), deps.revisions.findById(revisionId)]);
  if (!intro.ok) return intro;
  if (!found.ok) return found;
  if (intro.value === null || found.value === null || found.value.clientIntroId?.toLowerCase() !== clientIntroId) {
    return introRevisionNotFound(clientIntroId, revisionId);
  }
  return ok({ intro: intro.value, revision: found.value });
}

/**
 * Saves an edited `doc` of a client intro's head revision (Story 4.11a), as
 * `makeSaveRevisionDoc` does for a case: compare-and-set on `version`, one `revision_saved`
 * client event. The media guardrail allows the client's files and the live files of the
 * client's non-deleted cases (`ASSET_NOT_ALLOWED` otherwise); references the revision already
 * has are kept. The caller has authorized the actor to `edit`; the database checks the intro
 * is `in_review`.
 */
export function makeSaveIntroRevisionDoc(deps: IntroRevisionDeps) {
  return async function saveIntroRevisionDoc(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
    const parsed = parseInput(saveIntroRevisionDocInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientIntroId, revisionId, doc, expectedVersion } = parsed.value;
    const valid = validateNewDocument(doc);
    if (!valid.ok) return valid;
    if (valid.value.kind !== "client_intro") {
      return err({ code: "DOCUMENT_INVALID", message: "A client intro's document must be of kind client_intro.", details: { kind: valid.value.kind } });
    }

    const found = await introRevisionOf(deps, clientIntroId, revisionId);
    if (!found.ok) return found;
    const current = upgraded(found.value.revision);
    if (!current.ok) return current;

    const kept = new Set([...referencedAssetIds(current.value.doc), ...referencedAssetIds(current.value.generatedDoc)]);
    const added = [...referencedAssetIds(valid.value)].filter((id) => !kept.has(id));
    if (added.length > 0) {
      const allowed = await assetsOfIntro(deps, found.value.intro.clientId);
      if (!allowed.ok) return allowed;
      const foreign = added.filter((id) => !allowed.value.has(id));
      if (foreign.length > 0) {
        return err({
          code: "ASSET_NOT_ALLOWED",
          message: "The document references a file that is not this client's or one of its cases'.",
          details: { revisionId, assetIds: foreign.slice(0, 10) },
        });
      }
    }

    const saved = await deps.intros.saveDoc({ revisionId, doc: valid.value, expectedVersion, actorId: actor.id });
    if (!saved.ok) return saved;
    return upgraded(saved.value);
  };
}

/**
 * Approves a client intro (Story 4.11a, Story 4.8's rules): a person's call, never automatic
 * or in bulk. Every format of the revision's `doc` must be in `overflow` and `false` (else
 * `OVERFLOW_NOT_CLEARED`); every file it references must be a file of the client or a live
 * file of one of its non-deleted cases (else `MATERIAL_MISSING`, naming up to 10). Then, in
 * one transaction, the revision and the intro become `approved` with `approved_revision_id`,
 * a `transition` and a `revision_approved` client event. Only an `in_review` intro
 * (`CASE_NOT_APPROVABLE`); editing an approved intro comes with Story 4.11b. The caller has
 * authorized the actor to `approve`.
 */
export function makeApproveIntro(deps: IntroRevisionDeps) {
  return async function approveIntro(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
    const parsed = parseInput(approveIntroInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientIntroId, revisionId, expectedRevisionVersion, expectedHeadVersion, overflow } = parsed.value;

    const found = await introRevisionOf(deps, clientIntroId, revisionId);
    if (!found.ok) return found;
    if (found.value.revision.version !== expectedRevisionVersion) {
      return err({ code: "STALE_REVISION", message: "The revision changed since it was measured.", details: { revisionId, version: found.value.revision.version } });
    }
    const current = upgraded(found.value.revision);
    if (!current.ok) return current;

    const notCleared = Object.keys(current.value.doc.formats).filter((id) => overflow[id] !== false);
    if (notCleared.length > 0) {
      return err({ code: "OVERFLOW_NOT_CLEARED", message: "A format overflows, or was not measured.", details: { revisionId, formats: notCleared } });
    }

    const allowed = await assetsOfIntro(deps, found.value.intro.clientId);
    if (!allowed.ok) return allowed;
    const missing = [...referencedAssetIds(current.value.doc)].filter((id) => !allowed.value.has(id));
    if (missing.length > 0) {
      return err({ code: "MATERIAL_MISSING", message: "The revision references a file that is no longer there.", details: { revisionId, assetIds: missing.slice(0, 10) } });
    }

    const approved = await deps.intros.approve({ clientIntroId, revisionId, expectedRevisionVersion, expectedHeadVersion, actorId: actor.id });
    if (!approved.ok) return approved;
    return upgraded(approved.value);
  };
}
