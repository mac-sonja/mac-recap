import { describe, expect, it, vi } from "vitest";
import { testDraftTextSource } from "@/modules/generation";
import { workerTextSource } from "@/modules/generation/worker";

describe("the worker's text source (Story 3.6)", () => {
  it("keeps the marked test text without an API key, and uses the AI with one", () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(workerTextSource({})).toBe(testDraftTextSource);
    const ai = workerTextSource({ ANTHROPIC_API_KEY: "sk-test" });
    expect(ai).not.toBe(testDraftTextSource);
    expect(typeof ai.texts).toBe("function");
  });
});
