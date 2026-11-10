import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { ClientIntro } from "@/modules/case-study/domain/client-intro";
import type { ClientAsset } from "@/modules/case-study/domain/client-material";
import type { Client } from "@/modules/case-study/domain/case-study";
import type { Revision } from "@/modules/case-study/domain/revision";
import type { ClientIntroRepository } from "@/modules/case-study/ports/client-intro-repository";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import { buildClientIntroTestDraft, caseHistoryV2 } from "@/modules/generation";
import { FORMAT_IDS } from "@/modules/rendering";
import { err, ok } from "@/shared/result";
import {
  makeCreateIntroWorkingRevision,
  makeGetClientIntro,
  makeStartClientIntro,
  makeTransitionIntro,
  type EnqueueGenerate,
} from "./client-intro";

const actor: Actor = { id: "00000000-0000-4000-8000-000000000002", email: "o@mac.it", displayName: "Owner", role: "owner_designer" };
const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const INTRO_ID = "44444444-0000-4000-8000-000000000001";
const JOB_ID = "dddddddd-0000-4000-8000-000000000001";
const now = "2026-11-06T10:00:00.000000+00:00";

const intro = (over: Partial<ClientIntro> = {}): ClientIntro => ({
  id: INTRO_ID,
  clientId: CLIENT_ID,
  status: "draft",
  headRevisionId: null,
  approvedRevisionId: null,
  headVersion: 0,
  createdBy: actor.id,
  createdAt: now,
  updatedAt: now,
  ...over,
});

const client: Client = { id: CLIENT_ID, name: "Lumen Srl", code: "LUM", industry: "energia", description: "Brand.", logoId: null };

const asset = (n: number, kind: ClientAsset["kind"] = "image"): ClientAsset => ({
  id: `ffffffff-0000-4000-8000-00000000000${n}`,
  clientId: CLIENT_ID,
  position: n,
  fileName: `f${n}`,
  kind,
  contentType: kind === "image" ? "image/jpeg" : "application/pdf",
  sizeBytes: 10,
  width: null,
  height: null,
  createdAt: now,
});

/** An intro store: `existing` until `getOrCreate` makes one; transitions compare-and-set like the SQL. */
function fakes(existing: ClientIntro | null, assets: ClientAsset[] = [asset(1), asset(2)]) {
  let current = existing;
  const intros = {
    findById: vi.fn<ClientIntroRepository["findById"]>(async () => ok(current)),
    findByClientId: vi.fn<ClientIntroRepository["findByClientId"]>(async () => ok(current)),
    getOrCreate: vi.fn<ClientIntroRepository["getOrCreate"]>(async () => {
      current ??= intro();
      return ok(current);
    }),
    transition: vi.fn<ClientIntroRepository["transition"]>(async (change) => {
      if (current === null) return err({ code: "NOT_FOUND", message: "m" });
      if (current.status !== change.from) return err({ code: "STALE_STATUS", message: "m" });
      current = { ...current, status: change.to };
      return ok(current);
    }),
    createWorkingRevision: vi.fn<ClientIntroRepository["createWorkingRevision"]>(async (input) =>
      ok({
        id: "22222222-0000-4000-8000-000000000001",
        caseId: null,
        clientIntroId: input.clientIntroId,
        status: "working",
        version: 0,
        generatedDoc: input.doc,
        doc: input.doc,
        manifest: input.manifest,
        model: null,
        fellBack: false,
        promptVersion: null,
        schemaVersion: 2,
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      } satisfies Revision),
    ),
    listReadyIntros: vi.fn<ClientIntroRepository["listReadyIntros"]>(async () => ok([])),
    saveDoc: vi.fn<ClientIntroRepository["saveDoc"]>(async () => err({ code: "NOT_FOUND", message: "m" })),
    approve: vi.fn<ClientIntroRepository["approve"]>(async () => err({ code: "NOT_FOUND", message: "m" })),
  };
  const clients = {
    findById: vi.fn<ClientRepository["findById"]>(async () => ok(client)),
    listAssets: vi.fn<ClientRepository["listAssets"]>(async () => ok(assets)),
  };
  const enqueue = vi.fn<EnqueueGenerate>(async () => ok({ id: JOB_ID, status: "queued" }));
  return { intros, clients, enqueue, current: () => current };
}

describe("startClientIntro (Story 3.11)", () => {
  it("a new client with 2 images: creates its intro, enqueues one generate job and moves it to generating", async () => {
    const deps = fakes(null);
    const result = await makeStartClientIntro(deps)(actor, { clientId: CLIENT_ID });
    expect(result).toEqual(ok({ outcome: "started", introId: INTRO_ID, jobId: JOB_ID }));
    expect(deps.intros.getOrCreate).toHaveBeenCalledExactlyOnceWith(CLIENT_ID, actor.id);
    expect(deps.enqueue).toHaveBeenCalledExactlyOnceWith({
      kind: "generate",
      subjectId: INTRO_ID,
      inputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      payload: { subject: "client_intro", baseHeadVersion: 0 },
    });
    expect(deps.intros.transition).toHaveBeenCalledExactlyOnceWith({ clientIntroId: INTRO_ID, event: "generate", from: "draft", to: "generating", actorId: actor.id });
    expect(deps.current()?.status).toBe("generating");
  });

  it("fewer than 2 images: NO_CLIENT_IMAGES, no intro row, no job", async () => {
    const deps = fakes(null, [asset(1), asset(2, "document")]);
    expect(await makeStartClientIntro(deps)(actor, { clientId: CLIENT_ID })).toMatchObject({ ok: false, error: { code: "NO_CLIENT_IMAGES" } });
    expect(deps.intros.getOrCreate).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it.each(["generating", "in_review", "approved"] as const)("an intro already %s: nothing starts", async (status) => {
    const deps = fakes(intro({ status }), []);
    expect(await makeStartClientIntro(deps)(actor, { clientId: CLIENT_ID })).toEqual(ok({ outcome: "unchanged", introId: INTRO_ID, status }));
    expect(deps.clients.listAssets).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
    expect(deps.intros.transition).not.toHaveBeenCalled();
  });

  it("an intro back in Bozza after a failed draft starts again, from its head version", async () => {
    const deps = fakes(intro({ headVersion: 2 }));
    expect(await makeStartClientIntro(deps)(actor, { clientId: CLIENT_ID })).toMatchObject({ ok: true, value: { outcome: "started" } });
    expect(deps.intros.getOrCreate).not.toHaveBeenCalled();
    expect(deps.enqueue.mock.calls[0][0].payload).toEqual({ subject: "client_intro", baseHeadVersion: 2 });
  });

  it("a double click: the second save finds the intro generating and the same live job, and succeeds", async () => {
    const deps = fakes(intro());
    // Both read Bozza before either moved it.
    deps.intros.findByClientId.mockResolvedValue(ok(intro()));
    const start = makeStartClientIntro(deps);
    const [a, b] = await Promise.all([start(actor, { clientId: CLIENT_ID }), start(actor, { clientId: CLIENT_ID })]);
    expect([a, b]).toEqual([ok({ outcome: "started", introId: INTRO_ID, jobId: JOB_ID }), ok({ outcome: "started", introId: INTRO_ID, jobId: JOB_ID })]);
    expect(deps.enqueue.mock.calls[0][0].inputHash).toBe(deps.enqueue.mock.calls[1][0].inputHash);
    expect(deps.current()?.status).toBe("generating");
  });

  it("a lost race whose job is no longer live is the transition's error", async () => {
    const deps = fakes(intro());
    deps.enqueue.mockResolvedValue(ok({ id: JOB_ID, status: "failed" }));
    deps.intros.transition.mockResolvedValue(err({ code: "STALE_STATUS", message: "m" }));
    expect(await makeStartClientIntro(deps)(actor, { clientId: CLIENT_ID })).toMatchObject({ ok: false, error: { code: "STALE_STATUS" } });
  });

  it("an enqueue failure moves nothing", async () => {
    const deps = fakes(null);
    deps.enqueue.mockResolvedValue(err({ code: "INVALID_INPUT", message: "m" }));
    expect(await makeStartClientIntro(deps)(actor, { clientId: CLIENT_ID })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(deps.intros.transition).not.toHaveBeenCalled();
  });

  it("an unknown or deleted client is CLIENT_NOT_FOUND; a malformed input INVALID_INPUT", async () => {
    const deps = fakes(null);
    deps.clients.findById.mockResolvedValue(ok(null));
    expect(await makeStartClientIntro(deps)(actor, { clientId: CLIENT_ID })).toMatchObject({ ok: false, error: { code: "CLIENT_NOT_FOUND" } });
    expect(await makeStartClientIntro(deps)(actor, { clientId: "x" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
});

describe("transitionIntro (Story 3.11)", () => {
  it("applies the case transition table", async () => {
    const deps = fakes(intro({ status: "generating" }));
    expect(await makeTransitionIntro(deps)(INTRO_ID, "generation_succeeded", actor)).toMatchObject({ ok: true, value: { status: "in_review" } });
    expect(deps.intros.transition).toHaveBeenCalledWith({ clientIntroId: INTRO_ID, event: "generation_succeeded", from: "generating", to: "in_review", actorId: actor.id });
  });

  it("refuses approve and any pair outside the table, writing nothing", async () => {
    const deps = fakes(intro({ status: "in_review" }));
    expect(await makeTransitionIntro(deps)(INTRO_ID, "approve", actor)).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(await makeTransitionIntro(deps)(INTRO_ID, "generate", actor)).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(deps.intros.transition).not.toHaveBeenCalled();
  });

  it("an unknown or malformed intro is NOT_FOUND", async () => {
    expect(await makeTransitionIntro(fakes(null))(INTRO_ID, "generate", actor)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await makeTransitionIntro(fakes(null))("x", "generate", actor)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("createIntroWorkingRevision (Story 3.11)", () => {
  const doc = () => buildClientIntroTestDraft({ client: { description: "Brand.", context: "" }, images: [], resultRows: 0, hasTestimonial: false, newId: crypto.randomUUID.bind(crypto) });

  it("validates the document, then writes it once with the actor and defaults", async () => {
    const deps = fakes(intro({ status: "generating" }));
    const d = doc();
    const result = await makeCreateIntroWorkingRevision(deps)(actor, { clientIntroId: INTRO_ID.toUpperCase(), doc: d, expectedHeadVersion: 0 });
    expect(result).toMatchObject({ ok: true, value: { clientIntroId: INTRO_ID, doc: d } });
    expect(deps.intros.createWorkingRevision).toHaveBeenCalledExactlyOnceWith({
      clientIntroId: INTRO_ID,
      doc: d,
      manifest: {},
      meta: { model: null, fellBack: false, promptVersion: null },
      expectedHeadVersion: 0,
      actorId: actor.id,
    });
  });

  it("refuses a case history document, writing nothing", async () => {
    const deps = fakes(intro());
    expect(await makeCreateIntroWorkingRevision(deps)(actor, { clientIntroId: INTRO_ID, doc: caseHistoryV2(FORMAT_IDS), expectedHeadVersion: 0 })).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
    expect(deps.intros.createWorkingRevision).not.toHaveBeenCalled();
  });
});

describe("getClientIntro (Story 3.11)", () => {
  it("reads the client's intro, or null; a malformed id is CLIENT_NOT_FOUND", async () => {
    expect(await makeGetClientIntro(fakes(intro()))(CLIENT_ID)).toEqual(ok(intro()));
    expect(await makeGetClientIntro(fakes(null))(CLIENT_ID)).toEqual(ok(null));
    expect(await makeGetClientIntro(fakes(null))("x")).toMatchObject({ ok: false, error: { code: "CLIENT_NOT_FOUND" } });
  });
});
