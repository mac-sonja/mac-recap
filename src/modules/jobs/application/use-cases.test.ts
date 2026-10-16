import { describe, expect, it, vi } from "vitest";
import type { Job, JobSummary } from "@/modules/jobs/domain/job";
import { ok } from "@/shared/result";
import { makeEnqueue } from "./enqueue";
import { makeGetJobsFor } from "./get-jobs-for";

const SUBJECT = "bbbbbbbb-0000-4000-8000-000000000001";

describe("enqueue", () => {
  it("passes the parsed input (payload defaulted) to the repository", async () => {
    const created = { id: "j" } as unknown as Job;
    const enqueue = vi.fn(async () => ok(created));
    const result = await makeEnqueue({ enqueue })({ kind: "rendition", subjectId: SUBJECT, inputHash: "abc" });
    expect(result).toEqual(ok(created));
    expect(enqueue).toHaveBeenCalledWith({ kind: "rendition", subjectId: SUBJECT, inputHash: "abc", payload: {} });
  });

  it.each([
    [{ kind: "email", subjectId: SUBJECT, inputHash: "abc" }, "kind"],
    [{ kind: "rendition", subjectId: "x", inputHash: "abc" }, "subjectId"],
    [{ kind: "rendition", subjectId: SUBJECT, inputHash: "" }, "inputHash"],
    [{ kind: "rendition", subjectId: SUBJECT, inputHash: "abc", payload: "x" }, "payload"],
    [null, "(input)"],
  ])("rejects %j as INVALID_INPUT naming %s, without writing", async (input, field) => {
    const enqueue = vi.fn();
    const result = await makeEnqueue({ enqueue })(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect((result.error.details as { fields: string[] }).fields).toContain(field);
    }
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("getJobsFor", () => {
  it("returns the subject's jobs from the repository", async () => {
    const jobs = [{ id: "j2" }, { id: "j1" }] as unknown as JobSummary[];
    const listBySubject = vi.fn(async () => ok(jobs));
    expect(await makeGetJobsFor({ listBySubject })(SUBJECT)).toEqual(ok(jobs));
    expect(listBySubject).toHaveBeenCalledWith(SUBJECT);
  });

  it.each(["nope", 42, undefined])("rejects %j as INVALID_INPUT", async (id) => {
    const listBySubject = vi.fn();
    const result = await makeGetJobsFor({ listBySubject })(id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
    expect(listBySubject).not.toHaveBeenCalled();
  });
});
