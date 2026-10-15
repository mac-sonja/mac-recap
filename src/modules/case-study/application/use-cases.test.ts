import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { CASE_CREATED, TRANSITION, type CaseEvent } from "@/modules/case-study/domain/case-event";
import type { CaseStatus } from "@/shared/case-status";
import type { CaseStudy, Client } from "@/modules/case-study/domain/case-study";
import { err, ok } from "@/shared/result";
import { makeCreateCaseStudy } from "./create-case-study";
import { makeGetCaseStudy } from "./get-case-study";
import { makeListCaseStudies } from "./list-case-studies";
import { makeListClients } from "./list-clients";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import { makeRecordEvent } from "./record-event";
import { makeTransition } from "./transition";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};

const ACME: Client = { id: "cccccccc-0000-4000-8000-000000000001", name: "Acme", code: "ACM" };
const UNKNOWN_CLIENT_ID = "cccccccc-0000-4000-8000-00000000ffff";

/**
 * In-memory CaseStudyRepository: mirrors the DB defaults and the create
 * transaction, including `create_case_study`'s number per (client, year) and its
 * `CLIENT_NOT_FOUND` (the real codes come from SQL only).
 */
function fakeRepository() {
  const cases = new Map<string, CaseStudy>();
  const events: CaseEvent[] = [];
  const clients = new Map<string, Client>([[ACME.id, ACME]]);
  const counters = new Map<string, number>();
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const now = "2026-10-09T10:00:00.000000+00:00";

  const repo = {
    create: vi.fn<CaseStudyRepository["create"]>(async ({ clientId, ...input }, actorId) => {
      const client = clients.get(clientId);
      if (client === undefined) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id." });
      const pair = `${clientId}/${input.year}`;
      const number = (counters.get(pair) ?? 0) + 1;
      counters.set(pair, number);
      const row: CaseStudy = {
        id: uuid(),
        code: `${client.code}-${input.year}-${String(number).padStart(2, "0")}`,
        number,
        client,
        ...input,
        status: "draft",
        projectOrderRef: null,
        headRevisionId: null,
        approvedRevisionId: null,
        headVersion: 0,
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      cases.set(row.id, row);
      events.push({
        id: uuid(),
        caseId: row.id,
        revisionId: null,
        actorId,
        type: CASE_CREATED,
        at: now,
        // Same payload create_case_study writes.
        data: {
          name: row.name,
          client: client.name,
          clientId: client.id,
          clientCode: client.code,
          code: row.code,
          year: row.year,
          locale: row.locale,
        },
      });
      return ok(row);
    }),
    findById: vi.fn<CaseStudyRepository["findById"]>(async (id) => {
      const row = cases.get(id);
      return ok(row && row.deletedAt === null ? row : null);
    }),
    // Mirrors the adapter query: non-deleted, `status` when scoped, newest updated_at first.
    list: vi.fn<CaseStudyRepository["list"]>(async (scope) =>
      ok(
        [...cases.values()]
          .filter((row) => row.deletedAt === null && (scope.status === undefined || row.status === scope.status))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ),
    ),
    appendEvent: vi.fn<CaseStudyRepository["appendEvent"]>(async (event) => {
      if (!cases.has(event.caseId)) return ok(null);
      const row: CaseEvent = { id: uuid(), at: now, ...event };
      events.push(row);
      return ok(row);
    }),
    // Mirrors transition_case_study: compare-and-set on a non-deleted row, then one `transition` event.
    transition: vi.fn<CaseStudyRepository["transition"]>(async ({ caseId, event, from, to, actorId }) => {
      const row = cases.get(caseId);
      if (!row || row.deletedAt !== null) return err({ code: "NOT_FOUND", message: "No case study with this id." });
      if (row.status !== from) return err({ code: "STALE_STATUS", message: "Status changed." });
      const moved: CaseStudy = { ...row, status: to };
      cases.set(caseId, moved);
      events.push({ id: uuid(), caseId, revisionId: null, actorId, type: TRANSITION, at: now, data: { event, from, to } });
      return ok(moved);
    }),
  } satisfies CaseStudyRepository;

  return { repo, cases, events, clients };
}

describe("create", () => {
  it("creates a draft case with its code, locale it, created_by the actor and one case_created event", async () => {
    const { repo, events } = fakeRepository();
    const result = await makeCreateCaseStudy(repo)(actor, { name: " Rebrand ", clientId: ACME.id, year: 2026 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: "Rebrand",
      client: ACME,
      code: "ACM-2026-01",
      number: 1,
      year: 2026,
      locale: "it",
      status: "draft",
      createdBy: actor.id,
    });
    expect(repo.create).toHaveBeenCalledWith({ name: "Rebrand", clientId: ACME.id, year: 2026, locale: "it" }, actor.id);
    expect(events).toEqual([
      expect.objectContaining({
        caseId: result.value.id,
        type: CASE_CREATED,
        actorId: actor.id,
        data: expect.objectContaining({ clientId: ACME.id, clientCode: "ACM", code: "ACM-2026-01" }),
      }),
    ]);
  });

  it("drops a free-text client and any code the caller sends", async () => {
    const { repo } = fakeRepository();
    await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, client: "Acme", code: "ZZZ-1999-01", year: 2026 });
    expect(repo.create).toHaveBeenCalledWith({ name: "R", clientId: ACME.id, year: 2026, locale: "it" }, actor.id);
  });

  it.each([
    ["empty name", { name: "", clientId: ACME.id, year: 2026 }, ["name"]],
    ["no client picked", { name: "Rebrand", clientId: "", year: 2026 }, ["clientId"]],
    ["a free-text client", { name: "Rebrand", client: "Acme", year: 2026 }, ["clientId"]],
    ["both missing", { year: 2026 }, ["name", "clientId"]],
    ["non-integer year", { name: "R", clientId: ACME.id, year: 2026.1 }, ["year"]],
    ["year out of range", { name: "R", clientId: ACME.id, year: 1850 }, ["year"]],
    ["bad locale", { name: "R", clientId: ACME.id, year: 2026, locale: "de" }, ["locale"]],
  ])("%s → INVALID_INPUT naming the fields; nothing written", async (_label, input, fields) => {
    const { repo, cases, events } = fakeRepository();
    const result = await makeCreateCaseStudy(repo)(actor, input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect((result.error.details as { fields: string[] }).fields).toEqual(fields);
    }
    expect(repo.create).not.toHaveBeenCalled();
    expect(cases.size).toBe(0);
    expect(events).toEqual([]);
  });

  it("an unknown client → CLIENT_NOT_FOUND; nothing written", async () => {
    const { repo, cases, events } = fakeRepository();
    const result = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: UNKNOWN_CLIENT_ID, year: 2026 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_NOT_FOUND");
    expect(cases.size).toBe(0);
    expect(events).toEqual([]);
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CASE_STUDY_WRITE_FAILED", message: "down" });
    const { repo } = fakeRepository();
    repo.create.mockResolvedValueOnce(failure);
    expect(await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026 })).toEqual(failure);
  });
});

describe("listClients", () => {
  const client = (name: string, code: string, n: number): Client => ({
    id: `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    code,
  });

  function fakeClients(rows: Client[]) {
    return { list: vi.fn<ClientRepository["list"]>(async () => ok(rows)) } satisfies ClientRepository;
  }

  it("returns every client sorted by name, case- and accent-insensitive", async () => {
    const rows = [client("Zeta", "ZET", 1), client("città di Torino", "CIT", 2), client("Acme", "ACM", 3), client("Beta", "BET", 4)];
    const result = await makeListClients(fakeClients(rows))();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((c) => c.code)).toEqual(["ACM", "BET", "CIT", "ZET"]);
  });

  it("returns an empty list when there are no clients", async () => {
    expect(await makeListClients(fakeClients([]))()).toEqual(ok([]));
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CLIENT_LOOKUP_FAILED", message: "down" });
    const repo = fakeClients([]);
    repo.list.mockResolvedValueOnce(failure);
    expect(await makeListClients(repo)()).toEqual(failure);
  });
});

describe("get", () => {
  it("returns an existing case", async () => {
    const { repo } = fakeRepository();
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026 });
    if (!created.ok) throw new Error("setup");
    expect(await makeGetCaseStudy(repo)(created.value.id)).toEqual(ok(created.value));
  });

  it("returns NOT_FOUND for an unknown id", async () => {
    const result = await makeGetCaseStudy(fakeRepository().repo)("11111111-1111-4111-8111-111111111111");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND for a soft-deleted case", async () => {
    const { repo, cases } = fakeRepository();
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026 });
    if (!created.ok) throw new Error("setup");
    cases.set(created.value.id, { ...created.value, deletedAt: "2026-10-09T11:00:00Z" });
    const result = await makeGetCaseStudy(repo)(created.value.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it.each(["not-a-uuid", "", undefined, null, 42])("returns NOT_FOUND for %o without querying", async (id) => {
    const { repo } = fakeRepository();
    const result = await makeGetCaseStudy(repo)(id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "down" });
    const { repo } = fakeRepository();
    repo.findById.mockResolvedValueOnce(failure);
    expect(await makeGetCaseStudy(repo)("11111111-1111-4111-8111-111111111111")).toEqual(failure);
  });
});

describe("list", () => {
  /** A fake repository holding one case per status, plus a soft-deleted draft and a soft-deleted approved case. */
  async function seeded() {
    const fake = fakeRepository();
    const make = async (name: string, status: CaseStatus, updatedAt: string, deletedAt: string | null = null) => {
      const created = await makeCreateCaseStudy(fake.repo)(actor, { name, clientId: ACME.id, year: 2026 });
      if (!created.ok) throw new Error("setup");
      fake.cases.set(created.value.id, { ...created.value, status, updatedAt, deletedAt });
      return created.value.id;
    };
    const ids = {
      draft: await make("Draft", "draft", "2026-10-09T10:00:00Z"),
      generating: await make("Generating", "generating", "2026-10-11T10:00:00Z"),
      inReview: await make("In review", "in_review", "2026-10-10T10:00:00Z"),
      approved: await make("Approved", "approved", "2026-10-12T10:00:00Z"),
      oldApproved: await make("Old approved", "approved", "2026-10-01T10:00:00Z"),
      deletedDraft: await make("Deleted", "draft", "2026-10-13T10:00:00Z", "2026-10-13T11:00:00Z"),
      deletedApproved: await make("Deleted approved", "approved", "2026-10-13T10:00:00Z", "2026-10-13T11:00:00Z"),
    };
    return { ...fake, ids };
  }

  it("lists every non-deleted case for the all-statuses scope, newest updated first", async () => {
    const { repo, ids } = await seeded();
    const result = await makeListCaseStudies(repo)({});
    expect(repo.list).toHaveBeenCalledWith({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((c) => c.id)).toEqual([ids.approved, ids.generating, ids.inReview, ids.draft, ids.oldApproved]);
    }
  });

  it("lists approved cases only for the approved scope, never soft-deleted ones", async () => {
    const { repo, ids } = await seeded();
    const result = await makeListCaseStudies(repo)({ status: "approved" });
    expect(repo.list).toHaveBeenCalledWith({ status: "approved" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((c) => c.id)).toEqual([ids.approved, ids.oldApproved]);
  });

  it("returns an empty list when there are no cases", async () => {
    expect(await makeListCaseStudies(fakeRepository().repo)({})).toEqual(ok([]));
  });

  it.each([
    ["an unknown status", { status: "archived" }],
    ["an extra key", { status: "approved", createdBy: actor.id }],
    ["a non-object", "approved"],
    ["undefined", undefined],
  ])("rejects %s as INVALID_INPUT without querying", async (_label, scope) => {
    const { repo } = fakeRepository();
    const result = await makeListCaseStudies(repo)(scope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
    expect(repo.list).not.toHaveBeenCalled();
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "down" });
    const { repo } = fakeRepository();
    repo.list.mockResolvedValueOnce(failure);
    expect(await makeListCaseStudies(repo)({})).toEqual(failure);
  });
});

describe("recordEvent", () => {
  it("appends one event with the actor", async () => {
    const { repo, events } = fakeRepository();
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", clientId: ACME.id, year: 2026 });
    if (!created.ok) throw new Error("setup");
    const result = await makeRecordEvent(repo)(actor, {
      caseId: created.value.id,
      type: "text_added",
      data: { textItemId: "t1" },
    });
    expect(result).toEqual(
      ok(expect.objectContaining({ caseId: created.value.id, actorId: actor.id, type: "text_added", revisionId: null, data: { textItemId: "t1" } })),
    );
    expect(events).toHaveLength(2);
  });

  it("returns NOT_FOUND for an unknown case", async () => {
    const { repo, events } = fakeRepository();
    const result = await makeRecordEvent(repo)(actor, { caseId: "11111111-1111-4111-8111-111111111111", type: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(events).toEqual([]);
  });

  it("returns INVALID_INPUT without writing for a bad type", async () => {
    const { repo } = fakeRepository();
    const result = await makeRecordEvent(repo)(actor, { caseId: "11111111-1111-4111-8111-111111111111", type: "Bad Type" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
    expect(repo.appendEvent).not.toHaveBeenCalled();
  });
});

describe("transition", () => {
  /** A fake repository holding one case in `status`, with the create event cleared. */
  async function caseIn(status: CaseStatus, deletedAt: string | null = null) {
    const fake = fakeRepository();
    const created = await makeCreateCaseStudy(fake.repo)(actor, { name: "R", clientId: ACME.id, year: 2026 });
    if (!created.ok) throw new Error("setup");
    fake.cases.set(created.value.id, { ...created.value, status, deletedAt });
    fake.events.length = 0;
    return { ...fake, id: created.value.id };
  }

  it.each([
    ["draft", "generate", "generating"],
    ["generating", "generation_succeeded", "in_review"],
    ["generating", "generation_failed", "draft"],
    ["in_review", "approve", "approved"],
  ] as const)("%s --%s--> %s with one transition event", async (from, event, to) => {
    const { repo, events, id } = await caseIn(from);
    const result = await makeTransition(repo)(id, event, actor);
    expect(result).toEqual(ok(expect.objectContaining({ id, status: to })));
    expect(repo.transition).toHaveBeenCalledWith({ caseId: id, event, from, to, actorId: actor.id });
    expect(events).toEqual([
      expect.objectContaining({ caseId: id, actorId: actor.id, type: TRANSITION, data: { event, from, to } }),
    ]);
  });

  it.each([
    ["approve on draft", "draft", "approve"],
    ["generate on generating", "generating", "generate"],
    ["approve on approved", "approved", "approve"],
    ["generate on approved", "approved", "generate"],
    ["an unknown event", "draft", "fork"],
    ["a non-string event", "draft", 7],
  ] as const)("%s → INVALID_TRANSITION; nothing written", async (_label, status, event) => {
    const { repo, events, cases, id } = await caseIn(status);
    const result = await makeTransition(repo)(id, event, actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
    expect(repo.transition).not.toHaveBeenCalled();
    expect(cases.get(id)?.status).toBe(status);
    expect(events).toEqual([]);
  });

  it("returns STALE_STATUS when the status moved between read and write; nothing written", async () => {
    const { repo, events, cases, id } = await caseIn("draft");
    // Another writer moves the case right after the read.
    repo.findById.mockImplementationOnce(async (caseId) => {
      const read = cases.get(caseId)!;
      cases.set(caseId, { ...read, status: "generating" });
      return ok(read);
    });
    const result = await makeTransition(repo)(id, "generate", actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STALE_STATUS");
    expect(cases.get(id)?.status).toBe("generating");
    expect(events).toEqual([]);
  });

  it("returns NOT_FOUND for a soft-deleted case", async () => {
    const { repo, events, id } = await caseIn("draft", "2026-10-09T11:00:00Z");
    const result = await makeTransition(repo)(id, "generate", actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(repo.transition).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("returns NOT_FOUND for an unknown id", async () => {
    const { repo } = fakeRepository();
    const result = await makeTransition(repo)("11111111-1111-4111-8111-111111111111", "generate", actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(repo.transition).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "", undefined, 42])("returns NOT_FOUND for %o without querying", async (id) => {
    const { repo } = fakeRepository();
    const result = await makeTransition(repo)(id, "generate", actor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it.each([
    ["the lookup", "findById", err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "down" })],
    ["the write", "transition", err({ code: "CASE_STUDY_WRITE_FAILED", message: "down" })],
  ] as const)("passes a failure of %s through", async (_label, method, failure) => {
    const { repo, id } = await caseIn("draft");
    repo[method].mockResolvedValueOnce(failure);
    expect(await makeTransition(repo)(id, "generate", actor)).toEqual(failure);
  });
});
