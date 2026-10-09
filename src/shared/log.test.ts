import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "./log";

afterEach(() => vi.restoreAllMocks());

function capture() {
  return vi.spyOn(process.stdout, "write").mockImplementation(() => true);
}

describe("log", () => {
  it("writes one JSON line with level, msg, time and context ids", () => {
    const write = capture();
    log.info("x", { caseId: "c1", jobId: "j1", actorId: "a1" });

    expect(write).toHaveBeenCalledTimes(1);
    const line = String(write.mock.calls[0][0]);
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trim().split("\n")).toHaveLength(1);
    const entry = JSON.parse(line);
    expect(entry).toMatchObject({ level: "info", msg: "x", caseId: "c1", jobId: "j1", actorId: "a1" });
    expect(new Date(entry.time).toISOString()).toBe(entry.time);
  });

  it.each(["debug", "info", "warn", "error"] as const)("%s writes its level", (level) => {
    const write = capture();
    log[level]("x");
    expect(JSON.parse(String(write.mock.calls[0][0])).level).toBe(level);
  });

  it("omits absent ids and drops anything that is not a correlation id", () => {
    const write = capture();
    log.error("boom", { caseId: "c1", prompt: "secret" } as never);
    const entry = JSON.parse(String(write.mock.calls[0][0]));
    expect(Object.keys(entry).sort()).toEqual(["caseId", "level", "msg", "time"]);
  });
});
