import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildContent,
  createAnthropicNarrativeGenerator,
  FALLBACK_BETA,
  NARRATIVE_MODEL,
  narrativeOutputSchema,
} from "@/modules/generation/adapters/anthropic/narrative-generator";
import { FORMAT_TEXT_BUDGETS, PROMPT_VERSION, systemPrompt } from "@/modules/generation/adapters/prompts/case-narrative.v1";
import type { NarrativeRequest } from "@/modules/generation/ports/narrative-generator";
import { FORMAT_IDS, TEMPLATE_TEXT_KEYS } from "@/modules/rendering";

const SECRET = "Materiale riservato del cliente";
const request: NarrativeRequest = {
  locale: "it",
  form: { context: SECRET, solution: "Rebranding", results: [] },
  client: { name: "Helios", industry: "Energia", description: "Operatore", brief: { context: "", solution: "", results: [] } },
  documents: [
    { assetId: "doc-1", kind: "text", text: "Testo del brief" },
    { assetId: "pdf-1", kind: "pdf", bytes: new Uint8Array([37, 80, 68, 70]) },
  ],
  images: [{ assetId: "img-1", mediaType: "image/webp", bytes: new Uint8Array([1, 2, 3]) }],
};

const parsedOutput = Object.fromEntries(
  FORMAT_IDS.map((f) => [f, Object.fromEntries(Object.keys(FORMAT_TEXT_BUDGETS[f]).map((k) => [k, { text: `${f} ${k}`, aspect: "none", sourceRefs: [] }]))]),
);

function fakeClient(response: Record<string, unknown> | Error) {
  const parse = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}
const reply = (over: Record<string, unknown> = {}) => ({
  model: NARRATIVE_MODEL,
  stop_reason: "end_turn",
  usage: { output_tokens: 900, iterations: null },
  parsed_output: parsedOutput,
  ...over,
});

let logged = "";
beforeEach(() => {
  logged = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    logged += String(chunk);
    return true;
  });
});

describe("Anthropic narrative generator: the request", () => {
  it("one parse call: the model constant, adaptive thinking, high effort with the zod format, default fallbacks, no tools", async () => {
    const { client, parse } = fakeClient(reply());
    expect((await createAnthropicNarrativeGenerator({ client }).write(request)).ok).toBe(true);
    expect(parse).toHaveBeenCalledTimes(1);
    const params = (parse.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: expect.anything() },
    });
    expect(FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
    expect(params).not.toHaveProperty("tools");
    expect(params).not.toHaveProperty("temperature");
  });

  it("the content: each file after its label, the PDF as a base64 document, the image as base64, the form and client last", () => {
    const content = buildContent(request);
    expect(content.map((b) => b.type)).toEqual(["text", "text", "document", "text", "image", "text"]);
    expect(content[0]).toEqual({ type: "text", text: "[asset:doc-1]\nTesto del brief" });
    expect(content[2]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERg==" } });
    expect(content[4]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/webp", data: "AQID" } });
    const last = content[5] as { text: string };
    expect(last.text).toContain(`form_field context (Sfida): ${SECRET}`);
    expect(last.text).toContain("client_field industry: Energia");
    expect(last.text).toContain("italiano");
  });

  it("the system prompt carries the guide (name rule, §7 examples) and every format's limits", () => {
    const prompt = systemPrompt();
    expect(prompt).toContain("L'agenzia si chiama **MAC**");
    expect(prompt).toContain("Helios, operatore del settore energetico");
    expect(prompt).toContain("`video_9_16`");
    expect(prompt).toContain("`ideaBody` (testo dell'Idea: cosa abbiamo fatto e con quale idea): al massimo 900 caratteri");
    expect(PROMPT_VERSION).toBe("case-narrative@1");
  });

  it("the output schema is text only, with exactly the keys each format shows; Presentazione shows them all", () => {
    expect(Object.keys(FORMAT_TEXT_BUDGETS.presentazione_16_9).sort()).toEqual([...TEMPLATE_TEXT_KEYS].sort());
    expect(Object.keys(FORMAT_TEXT_BUDGETS.video_9_16)).toEqual(["title", "subtitle"]);
    const json = JSON.stringify(narrativeOutputSchema.toJSONSchema());
    for (const word of ["layout", "assetId", "about", "check", "slot"]) expect(json).not.toContain(`"${word}"`);
    expect(narrativeOutputSchema.safeParse(parsedOutput).success).toBe(true);
  });
});

describe("Anthropic narrative generator: the answer", () => {
  it("returns the texts (aspect none dropped), the served model and the prompt version; logs no text", async () => {
    const { client } = fakeClient(reply());
    const out = await createAnthropicNarrativeGenerator({ client }).write(request);
    expect(out.ok && out.value).toMatchObject({ model: NARRATIVE_MODEL, fellBack: false, promptVersion: PROMPT_VERSION });
    expect(out.ok && out.value.texts.video_9_16.title).toEqual({ text: "video_9_16 title", sourceRefs: [] });
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("video_9_16 title");
  });

  it("a fallback_message iteration marks fellBack and the served model is recorded", async () => {
    const { client } = fakeClient(reply({ model: "claude-opus-4-8", usage: { output_tokens: 1, iterations: [{ type: "message" }, { type: "fallback_message" }] } }));
    const out = await createAnthropicNarrativeGenerator({ client }).write(request);
    expect(out.ok && out.value).toMatchObject({ model: "claude-opus-4-8", fellBack: true });
  });

  it("refusal: LLM_REFUSAL; max_tokens: LLM_TRUNCATED; no parsed output: LLM_OUTPUT_INVALID", async () => {
    for (const [over, code] of [
      [{ stop_reason: "refusal", parsed_output: null }, "LLM_REFUSAL"],
      [{ stop_reason: "max_tokens" }, "LLM_TRUNCATED"],
      [{ parsed_output: null }, "LLM_OUTPUT_INVALID"],
    ] as const) {
      const { client } = fakeClient(reply(over));
      expect(await createAnthropicNarrativeGenerator({ client }).write(request)).toMatchObject({ ok: false, error: { code } });
    }
  });

  it("API errors: 429 and 5xx are LLM_UNAVAILABLE, a 400 is LLM_REQUEST_REJECTED, anything else LLM_OUTPUT_INVALID", async () => {
    const apiError = (status: number) => Anthropic.APIError.generate(status, { error: { message: SECRET } }, SECRET, new Headers());
    for (const [error, code] of [
      [apiError(429), "LLM_UNAVAILABLE"],
      [apiError(529), "LLM_UNAVAILABLE"],
      [apiError(400), "LLM_REQUEST_REJECTED"],
      [new SyntaxError(SECRET), "LLM_OUTPUT_INVALID"],
    ] as const) {
      const { client } = fakeClient(error);
      expect(await createAnthropicNarrativeGenerator({ client }).write(request)).toMatchObject({ ok: false, error: { code } });
    }
    expect(logged).not.toContain(SECRET);
  });
});
