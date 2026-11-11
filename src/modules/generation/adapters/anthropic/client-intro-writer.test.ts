import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClientIntroContent, clientIntroOutputSchema, createAnthropicClientIntroWriter } from "@/modules/generation/adapters/anthropic/client-intro-writer";
import { FALLBACK_BETA, NARRATIVE_MODEL } from "@/modules/generation/adapters/anthropic/narrative-generator";
import { PROMPT_VERSION, systemPrompt } from "@/modules/generation/adapters/prompts/client-intro.v1";
import { PROMPT_VERSION as CASE_PROMPT_VERSION } from "@/modules/generation/adapters/prompts/case-narrative.v1";
import { CLIENT_INTRO_TEXT_LIMITS, type ClientIntroRequest } from "@/modules/generation/ports/client-intro-writer";
import { CLIENT_TEMPLATE_TEXT_KEYS } from "@/modules/rendering";

const SECRET = "Descrizione riservata del cliente";
const request: ClientIntroRequest = {
  locale: "it",
  client: {
    name: "Helios",
    industry: "Energia",
    description: SECRET,
    brief: { context: "Contesto", solution: "", results: [{ label: "Clienti", value: "+40%" }], testimonial: { quote: "Ottimo lavoro", author: "Anna" } },
  },
  documents: [
    { assetId: "pdf-1", kind: "pdf", bytes: new Uint8Array([37, 80, 68, 70]) },
    { assetId: "pdf-2", kind: "text", text: "Testo del PDF grande" },
  ],
};

const parsedOutput = Object.fromEntries(CLIENT_TEMPLATE_TEXT_KEYS.map((k) => [k, { text: `testo ${k}`, aspect: "none", sourceRefs: [{ kind: "client_field", id: "name" }] }]));

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
  usage: { output_tokens: 300, iterations: null },
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

describe("Anthropic client intro writer: the request (Story 3.9)", () => {
  it("one parse call, as the case: the model constant, adaptive thinking, high effort with the zod format, default fallbacks, no tools", async () => {
    const { client, parse } = fakeClient(reply());
    expect((await createAnthropicClientIntroWriter({ client }).write(request)).ok).toBe(true);
    expect(parse).toHaveBeenCalledTimes(1);
    const params = (parse.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: expect.anything() },
    });
    expect(params).not.toHaveProperty("tools");
  });

  it("the content: each PDF after its label (whole as base64, or its text), then the client's fields as labelled lines; no image", () => {
    const content = buildClientIntroContent(request);
    expect(content.map((b) => b.type)).toEqual(["text", "document", "text", "text"]);
    expect(content[1]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERg==" } });
    expect(content[2]).toEqual({ type: "text", text: "[asset:pdf-2]\nTesto del PDF grande" });
    const last = (content[3] as { text: string }).text;
    expect(last).toContain("client_field name: Helios");
    expect(last).toContain("client_field industry: Energia");
    expect(last).toContain(`client_field description: ${SECRET}`);
    expect(last).toContain("client_field context: Contesto");
    expect(last).toContain("Clienti: +40%");
    expect(last).toContain("client_field testimonial: «Ottimo lavoro» (Anna)");
    // An empty field is not sent.
    expect(last).not.toContain("client_field solution");
    expect(last).toContain("italiano");
  });

  it("a sparse client sends only its name, sector and description", () => {
    const sparse: ClientIntroRequest = {
      locale: "it",
      client: { name: "Helios", industry: "Energia", description: "Operatore", brief: { context: "", solution: "", results: [], testimonial: null } },
      documents: [],
    };
    const content = buildClientIntroContent(sparse);
    expect(content).toHaveLength(1);
    const lines = (content[0] as { text: string }).text.split("\n").filter((l) => l.startsWith("client_field"));
    expect(lines).toEqual(["client_field name: Helios", "client_field industry: Energia", "client_field description: Operatore"]);
  });

  it("the system prompt: the copywriting guide, the four texts with their limits, a new prompt version", () => {
    const prompt = systemPrompt();
    expect(prompt).toContain("L'agenzia si chiama **MAC**");
    for (const key of CLIENT_TEMPLATE_TEXT_KEYS) expect(prompt).toContain(`\`${key}\``);
    expect(prompt).toContain(`al massimo ${CLIENT_INTRO_TEXT_LIMITS.introBody} caratteri`);
    expect(PROMPT_VERSION).toBe("client-intro@1");
    expect(CASE_PROMPT_VERSION).toBe("case-narrative@1");
  });

  it("the output schema is exactly the four texts, text only", () => {
    const json = JSON.stringify(clientIntroOutputSchema.toJSONSchema());
    for (const word of ["layout", "assetId", "about", "check", "slot", "presentazione_16_9"]) expect(json).not.toContain(`"${word}"`);
    expect(Object.keys(clientIntroOutputSchema.shape).sort()).toEqual([...CLIENT_TEMPLATE_TEXT_KEYS].sort());
    expect(clientIntroOutputSchema.safeParse(parsedOutput).success).toBe(true);
  });
});

describe("Anthropic client intro writer: the answer", () => {
  it("returns the four texts (aspect none dropped), the served model and the prompt version; logs no text", async () => {
    const { client } = fakeClient(reply());
    const out = await createAnthropicClientIntroWriter({ client }).write(request);
    expect(out.ok && out.value).toMatchObject({ model: NARRATIVE_MODEL, fellBack: false, promptVersion: "client-intro@1" });
    expect(out.ok && out.value.texts.introHead).toEqual({ text: "testo introHead", sourceRefs: [{ kind: "client_field", id: "name" }] });
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("testo introHead");
  });

  it("a fallback_message iteration marks fellBack", async () => {
    const { client } = fakeClient(reply({ model: "claude-opus-4-8", usage: { output_tokens: 1, iterations: [{ type: "fallback_message" }] } }));
    expect(await createAnthropicClientIntroWriter({ client }).write(request)).toMatchObject({ ok: true, value: { model: "claude-opus-4-8", fellBack: true } });
  });

  it("refusal, truncation, no parsed output and API errors map as for the case", async () => {
    const apiError = (status: number) => Anthropic.APIError.generate(status, { error: { message: SECRET } }, SECRET, new Headers());
    for (const [response, code] of [
      [reply({ stop_reason: "refusal", parsed_output: null }), "LLM_REFUSAL"],
      [reply({ stop_reason: "max_tokens" }), "LLM_TRUNCATED"],
      [reply({ parsed_output: null }), "LLM_OUTPUT_INVALID"],
      [apiError(529), "LLM_UNAVAILABLE"],
      [apiError(400), "LLM_REQUEST_REJECTED"],
      [new SyntaxError(SECRET), "LLM_OUTPUT_INVALID"],
    ] as const) {
      const { client } = fakeClient(response);
      expect(await createAnthropicClientIntroWriter({ client }).write(request)).toMatchObject({ ok: false, error: { code } });
    }
    expect(logged).not.toContain(SECRET);
  });
});
