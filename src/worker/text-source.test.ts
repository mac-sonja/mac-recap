import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { clientTestTextSource, testDraftTextSource, TEST_DRAFT_MARKER } from "@/modules/generation";
import { generateHandler, workerClientTextSource, workerTextSource } from "@/modules/generation/worker";
import { ok } from "@/shared/result";

// The worker reads ANTHROPIC_API_KEY through getEnv on its first job: set it here, and stand
// in for the Anthropic client writer, so no request leaves the test.
vi.mock("@/shared/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/env")>()),
  getEnv: () => ({ ANTHROPIC_API_KEY: "sk-test" }),
}));
const write = vi.hoisted(() => vi.fn());
vi.mock("@/modules/generation/adapters/anthropic/client-intro-writer", () => ({ createAnthropicClientIntroWriter: () => ({ write }) }));

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

  it("generateHandler wires it into the intro job: with the key, the intro gets the AI's texts and meta", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const ref = [{ kind: "client_field", id: "name" }];
    write.mockResolvedValue(
      ok({
        texts: {
          introHead: { text: "Luce per hotel", sourceRefs: ref },
          introBody: { text: "Lumen disegna lampade.", sourceRefs: ref },
          outroHead: { text: "Un lavoro insieme", sourceRefs: ref },
          outroBody: { text: "Abbiamo costruito un'identità.", sourceRefs: ref },
        },
        model: "claude-opus-5-5",
        fellBack: false,
        promptVersion: "client-intro@1",
      }),
    );
    const INTRO_ID = randomUUID();
    const images = [randomUUID(), randomUUID()];
    const createIntroWorkingRevision = vi.fn(async () => ok({ id: "rev" }));
    const handler = generateHandler({
      getSystemActor: async () => ok({ id: randomUUID(), role: "system" } as unknown as Actor),
      intro: {
        getIntro: async () => ok({ clientId: randomUUID(), status: "generating" as const, headVersion: 0 }),
        getClient: async () =>
          ok({
            name: "Lumen",
            industry: null,
            description: "Lampade",
            brief: { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" },
          }),
        listClientAssets: async () => ok(images.map((id) => ({ id, kind: "image", contentType: "image/jpeg" }))),
        transitionIntro: async () => ok({}),
        createIntroWorkingRevision,
      },
    });
    const job = { id: randomUUID(), subjectId: INTRO_ID, payload: { subject: "client_intro", baseHeadVersion: 0 } };
    expect(await handler.run(job as never, new AbortController().signal)).toEqual(ok(undefined));
    expect(write).toHaveBeenCalledTimes(1);
    const input = (createIntroWorkingRevision.mock.calls[0] as unknown as [Actor, { doc: unknown; meta: unknown }])[1];
    expect(input.meta).toEqual({ model: "claude-opus-5-5", fellBack: false, promptVersion: "client-intro@1" });
    expect(JSON.stringify(input.doc)).toContain("Luce per hotel");
    expect(JSON.stringify(input.doc)).not.toContain(TEST_DRAFT_MARKER);
  });
});
