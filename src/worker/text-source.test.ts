import { describe, expect, it, vi } from "vitest";
import { clientTestTextSource, testDraftTextSource } from "@/modules/generation";
import { workerClientTextSource, workerTextSource } from "@/modules/generation/worker";

describe("the worker's text source (Story 3.6)", () => {
  it("keeps the marked test text without an API key, and uses the AI with one", () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(workerTextSource({})).toBe(testDraftTextSource);
    const ai = workerTextSource({ ANTHROPIC_API_KEY: "sk-test" });
    expect(ai).not.toBe(testDraftTextSource);
    expect(typeof ai.texts).toBe("function");
  });
});

describe("the worker's client text source (Story 3.9)", () => {
  it("keeps the 3.11 test text without an API key, and uses the AI with one", () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(workerClientTextSource({})).toBe(clientTestTextSource);
    const ai = workerClientTextSource({ ANTHROPIC_API_KEY: "sk-test" });
    expect(ai).not.toBe(clientTestTextSource);
    expect(typeof ai.texts).toBe("function");
  });
});
