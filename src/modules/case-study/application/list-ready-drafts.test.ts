import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { selectReadyDrafts, type ReadyDraftCase, type TransitionRecord } from "@/modules/case-study/domain/ready-draft";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import { ok } from "@/shared/result";
import { makeListReadyDrafts } from "./list-ready-drafts";

const ME: Actor = { id: "00000000-0000-4000-8000-000000000002", email: "me@mac.it", displayName: "Me", role: "owner_designer" };
const OTHER = "00000000-0000-4000-8000-000000000003";
/** The worker's actor: it records `generation_succeeded` and `generation_failed`. */
const SYSTEM = "00000000-0000-4000-8000-000000000099";

const SINCE = "2026-11-04T10:00:00.000Z";
const BEFORE = "2026-11-04T09:59:00.000000+00:00";
const AFTER = (s: number) => `2026-11-04T10:00:${String(s).padStart(2, "0")}.000000+00:00`;

const caseId = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const live = (n: number, name = `Case ${n}`): ReadyDraftCase => ({ id: caseId(n), name, status: "in_review", deletedAt: null });
const generate = (n: number, actorId: string, at: string): TransitionRecord => ({ caseId: caseId(n), actorId, event: "generate", at });
const succeeded = (n: number, at: string): TransitionRecord => ({ caseId: caseId(n), actorId: SYSTEM, event: "generation_succeeded", at });
const failed = (n: number, at: string): TransitionRecord => ({ caseId: caseId(n), actorId: SYSTEM, event: "generation_failed", at });

/** A repository holding `transitions` and `cases`, reading them as the Supabase adapter does (successes after `since`). */
function fakeRepository(transitions: TransitionRecord[], cases: ReadyDraftCase[]) {
  return {
    listReadyDrafts: vi.fn<CaseStudyRepository["listReadyDrafts"]>(async (actorId, since) =>
      ok(
        selectReadyDrafts(
          transitions.filter((t) => t.event !== "generation_succeeded" || Date.parse(t.at) > Date.parse(since)),
          cases,
          actorId,
        ),
      ),
    ),
  } as unknown as CaseStudyRepository & { listReadyDrafts: ReturnType<typeof vi.fn> };
}

/** The clock the use case clamps `since` against: a minute after the session start. */
const NOW = () => new Date("2026-11-04T10:01:00.000Z");

async function readyFor(actor: Actor, transitions: TransitionRecord[], cases: ReadyDraftCase[], since = SINCE) {
  const result = await makeListReadyDrafts(fakeRepository(transitions, cases), NOW)(actor, { since });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe("listReadyDrafts (Story 3.8)", () => {
  it("returns my case once it reached Da approvare after the session started, with its name and time", async () => {
    const drafts = await readyFor(ME, [generate(1, ME.id, BEFORE), succeeded(1, AFTER(5))], [live(1, "Rebrand Lumen")]);
    expect(drafts).toEqual([{ id: caseId(1), name: "Rebrand Lumen", readyAt: AFTER(5) }]);
  });

  it("leaves out someone else's generation", async () => {
    const drafts = await readyFor(ME, [generate(1, OTHER, BEFORE), succeeded(1, AFTER(5))], [live(1)]);
    expect(drafts).toEqual([]);
  });

  it("goes by the latest generate: mine after someone else's failed run counts, theirs after mine does not", async () => {
    const transitions = [
      generate(1, OTHER, "2026-11-04T09:00:00.000000+00:00"),
      failed(1, "2026-11-04T09:10:00.000000+00:00"),
      generate(1, ME.id, BEFORE),
      succeeded(1, AFTER(5)),
      generate(2, ME.id, "2026-11-04T09:00:00.000000+00:00"),
      failed(2, "2026-11-04T09:10:00.000000+00:00"),
      generate(2, OTHER, BEFORE),
      succeeded(2, AFTER(6)),
    ];
    expect((await readyFor(ME, transitions, [live(1), live(2)])).map((d) => d.id)).toEqual([caseId(1)]);
  });

  it("leaves out drafts that became ready before the session started (no replay)", async () => {
    const drafts = await readyFor(ME, [generate(1, ME.id, "2026-11-04T09:00:00.000000+00:00"), succeeded(1, BEFORE)], [live(1)]);
    expect(drafts).toEqual([]);
  });

  it("leaves out a failed generation", async () => {
    const drafts = await readyFor(ME, [generate(1, ME.id, BEFORE), failed(1, AFTER(5))], [live(1)]);
    expect(drafts).toEqual([]);
  });

  it("leaves out a deleted case", async () => {
    const deleted: ReadyDraftCase = { ...live(1), deletedAt: AFTER(9) };
    const drafts = await readyFor(ME, [generate(1, ME.id, BEFORE), succeeded(1, AFTER(5))], [deleted]);
    expect(drafts).toEqual([]);
  });

  it("returns several ready cases once each, oldest first", async () => {
    const transitions = [
      generate(1, ME.id, BEFORE),
      generate(2, ME.id, BEFORE),
      succeeded(2, AFTER(3)),
      succeeded(1, AFTER(7)),
    ];
    expect((await readyFor(ME, transitions, [live(1), live(2)])).map((d) => d.id)).toEqual([caseId(2), caseId(1)]);
  });

  it("leaves out a success older than the latest generate (a regeneration still running)", async () => {
    const transitions = [generate(1, ME.id, AFTER(1)), succeeded(1, AFTER(5)), generate(1, ME.id, AFTER(9))];
    expect(await readyFor(ME, transitions, [{ ...live(1), status: "generating" }])).toEqual([]);
    // Even if the status read says Da approvare, the success must follow the latest press.
    expect(await readyFor(ME, transitions, [live(1)])).toEqual([]);
  });

  it("leaves out a case no longer Da approvare", async () => {
    const transitions = [generate(1, ME.id, BEFORE), succeeded(1, AFTER(5))];
    expect(await readyFor(ME, transitions, [{ ...live(1), status: "approved" }])).toEqual([]);
  });

  it("trusts the query's after-since filter: a success in the same millisecond as since still counts", () => {
    // The adapter reads `at > since` in Postgres (microseconds); no millisecond filter here.
    const drafts = selectReadyDrafts([generate(1, ME.id, BEFORE), succeeded(1, "2026-11-04T10:00:00.000400+00:00")], [live(1)], ME.id);
    expect(drafts.map((d) => d.id)).toEqual([caseId(1)]);
  });

  it("clamps since to no earlier than 24 hours before now", async () => {
    const repo = fakeRepository([], []);
    await makeListReadyDrafts(repo, NOW)(ME, { since: "2026-10-01T00:00:00.000Z" });
    expect(repo.listReadyDrafts).toHaveBeenCalledWith(ME.id, "2026-11-03T10:01:00.000Z");
  });

  it("refuses a malformed since with INVALID_INPUT, querying nothing", async () => {
    const repo = fakeRepository([], []);
    for (const input of [{}, { since: "yesterday" }, { since: SINCE, extra: 1 }, null]) {
      const result = await makeListReadyDrafts(repo)(ME, input);
      expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
    expect(repo.listReadyDrafts).not.toHaveBeenCalled();
  });

  it("asks the repository for the actor's drafts since the given time", async () => {
    const repo = fakeRepository([], []);
    await makeListReadyDrafts(repo, NOW)(ME, { since: SINCE });
    expect(repo.listReadyDrafts).toHaveBeenCalledWith(ME.id, SINCE);
  });
});
