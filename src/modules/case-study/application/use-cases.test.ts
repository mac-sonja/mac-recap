import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { CASE_CREATED, type CaseEvent } from "@/modules/case-study/domain/case-event";
import type { CaseStudy } from "@/modules/case-study/domain/case-study";
import { err, ok } from "@/shared/result";
import { makeCreateCaseStudy } from "./create-case-study";
import { makeGetCaseStudy } from "./get-case-study";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import { makeRecordEvent } from "./record-event";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};

/** In-memory CaseStudyRepository: mirrors the DB defaults and the create transaction. */
function fakeRepository() {
  const cases = new Map<string, CaseStudy>();
  const events: CaseEvent[] = [];
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const now = "2026-10-09T10:00:00.000000+00:00";

  const repo = {
    create: vi.fn<CaseStudyRepository["create"]>(async (input, actorId) => {
      const row: CaseStudy = {
        id: uuid(),
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
        data: { name: row.name, client: row.client, year: row.year, locale: row.locale },
      });
      return ok(row);
    }),
    findById: vi.fn<CaseStudyRepository["findById"]>(async (id) => {
      const row = cases.get(id);
      return ok(row && row.deletedAt === null ? row : null);
    }),
    appendEvent: vi.fn<CaseStudyRepository["appendEvent"]>(async (event) => {
      if (!cases.has(event.caseId)) return ok(null);
      const row: CaseEvent = { id: uuid(), at: now, ...event };
      events.push(row);
      return ok(row);
    }),
  } satisfies CaseStudyRepository;

  return { repo, cases, events };
}

describe("create", () => {
  it("creates a draft case with locale it, created_by the actor and one case_created event", async () => {
    const { repo, events } = fakeRepository();
    const result = await makeCreateCaseStudy(repo)(actor, { name: " Rebrand ", client: "Acme", year: 2026 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: "Rebrand",
      client: "Acme",
      year: 2026,
      locale: "it",
      status: "draft",
      createdBy: actor.id,
    });
    expect(repo.create).toHaveBeenCalledWith({ name: "Rebrand", client: "Acme", year: 2026, locale: "it" }, actor.id);
    expect(events).toEqual([expect.objectContaining({ caseId: result.value.id, type: CASE_CREATED, actorId: actor.id })]);
  });

  it.each([
    ["empty name", { name: "", client: "Acme", year: 2026 }, ["name"]],
    ["whitespace client", { name: "Rebrand", client: "  ", year: 2026 }, ["client"]],
    ["both missing", { year: 2026 }, ["name", "client"]],
    ["non-integer year", { name: "R", client: "A", year: 2026.1 }, ["year"]],
    ["year out of range", { name: "R", client: "A", year: 1850 }, ["year"]],
    ["bad locale", { name: "R", client: "A", year: 2026, locale: "de" }, ["locale"]],
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

  it("passes a repository failure through", async () => {
    const failure = err({ code: "CASE_STUDY_WRITE_FAILED", message: "down" });
    const { repo } = fakeRepository();
    repo.create.mockResolvedValueOnce(failure);
    expect(await makeCreateCaseStudy(repo)(actor, { name: "R", client: "A", year: 2026 })).toEqual(failure);
  });
});

describe("get", () => {
  it("returns an existing case", async () => {
    const { repo } = fakeRepository();
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", client: "A", year: 2026 });
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
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", client: "A", year: 2026 });
    if (!created.ok) throw new Error("setup");
    cases.set(created.value.id, { ...created.value, deletedAt: "2026-10-09T11:00:00Z" });
    const result = await makeGetCaseStudy(repo)(created.value.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it.each(["not-a-uuid", "", undefined, 42])("returns NOT_FOUND for %o without querying", async (id) => {
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

describe("recordEvent", () => {
  it("appends one event with the actor", async () => {
    const { repo, events } = fakeRepository();
    const created = await makeCreateCaseStudy(repo)(actor, { name: "R", client: "A", year: 2026 });
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
