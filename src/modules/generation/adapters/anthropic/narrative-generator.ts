import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { FORMAT_TEXT_BUDGETS, PROMPT_VERSION, systemPrompt } from "@/modules/generation/adapters/prompts/case-narrative.v1";
import type { NarrativeGenerator, NarrativeRequest, NarrativeResult, NarrativeText } from "@/modules/generation/ports/narrative-generator";
import { FORMAT_IDS, type FormatId, type TemplateTextKey } from "@/modules/rendering";
import { log } from "@/shared/log";
import { err, ok } from "@/shared/result";

/** The one model constant (AR7). */
export const NARRATIVE_MODEL = "claude-opus-5-5";
/** Server-side refusal fallbacks, routed by refusal category (no model list to maintain). */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Leaves room for adaptive thinking at high effort and every format's texts, under the SDK's non-streaming limit. */
export const MAX_TOKENS = 16_000;

const refSchema = z.object({
  kind: z.enum(["asset", "form_field", "client_field"]),
  id: z.string(),
});
const textSchema = z.object({
  text: z.string(),
  aspect: z.enum(["technical", "graphic", "none"]),
  sourceRefs: z.array(refSchema),
});

/** Per format, exactly the texts its default pages show. Only text: no layout, asset, about or check field (AR19). */
export const narrativeOutputSchema = z.object(
  Object.fromEntries(
    FORMAT_IDS.map((formatId) => [formatId, z.object(Object.fromEntries(Object.keys(FORMAT_TEXT_BUDGETS[formatId]).map((key) => [key, textSchema])))]),
  ) as Record<FormatId, z.ZodObject<Record<string, typeof textSchema>>>,
);
type NarrativeOutput = z.infer<typeof narrativeOutputSchema>;

const label = (assetId: string) => `[asset:${assetId}]`;
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** The case's form and client info as text, labelled by source. */
function contextText(request: NarrativeRequest): string {
  const results = (rows: readonly { label: string; value: string }[]) => (rows.length === 0 ? "(nessuno)" : rows.map((r) => `${r.label}: ${r.value}`).join("; "));
  const lines = [
    "# Modulo del progetto",
    `form_field context (Sfida): ${request.form.context.trim() || "(vuoto)"}`,
    `form_field solution (Idea): ${request.form.solution.trim() || "(vuoto)"}`,
    `Risultati inseriti (vanno sulla pagina di chiusura come sono, non nei tuoi testi): ${results(request.form.results)}`,
    "",
    "# Scheda cliente",
  ];
  if (request.client === null) {
    lines.push("(nessun cliente)");
  } else {
    const c = request.client;
    lines.push(
      `Nome: ${c.name}`,
      `client_field industry: ${c.industry ?? "(vuoto)"}`,
      `client_field description: ${c.description?.trim() || "(vuoto)"}`,
      `client_field context: ${c.brief.context.trim() || "(vuoto)"}`,
      `client_field solution: ${c.brief.solution.trim() || "(vuoto)"}`,
      `client_field results: ${results(c.brief.results)}`,
    );
  }
  lines.push("", `Scrivi i testi in italiano (${request.locale}) per ogni formato, seguendo le linee guida e i limiti di lunghezza.`);
  return lines.join("\n");
}

/** The user turn: documents, then images, each after its label, then the form and the client. */
export function buildContent(request: NarrativeRequest): Anthropic.Beta.BetaContentBlockParam[] {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const doc of request.documents) {
    if (doc.kind === "pdf") {
      content.push({ type: "text", text: label(doc.assetId) });
      content.push({ type: "document", title: label(doc.assetId), source: { type: "base64", media_type: "application/pdf", data: base64(doc.bytes) } });
    } else {
      content.push({ type: "text", text: `${label(doc.assetId)}\n${doc.text}` });
    }
  }
  for (const image of request.images) {
    content.push({ type: "text", text: label(image.assetId) });
    content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: base64(image.bytes) } });
  }
  content.push({ type: "text", text: contextText(request) });
  return content;
}

/** The parsed output as the port's texts: `aspect: none` dropped. */
function toTexts(output: NarrativeOutput): NarrativeResult["texts"] {
  return Object.fromEntries(
    FORMAT_IDS.map((formatId) => [
      formatId,
      Object.fromEntries(
        Object.entries(output[formatId]).map(([key, t]) => {
          const text: NarrativeText = { text: t.text, sourceRefs: t.sourceRefs as NarrativeText["sourceRefs"], ...(t.aspect === "none" ? {} : { aspect: t.aspect }) };
          return [key as TemplateTextKey, text];
        }),
      ),
    ]),
  ) as NarrativeResult["texts"];
}

/** Whether a fallback model served the answer: a `fallback_message` entry in `usage.iterations`. */
function servedByFallback(usage: Anthropic.Beta.BetaUsage): boolean {
  const iterations = (usage as { iterations?: readonly { type: string }[] | null }).iterations ?? [];
  return iterations.some((entry) => entry.type === "fallback_message");
}

/**
 * The Anthropic narrative generator (Story 3.6): one `beta.messages.parse` call with the zod
 * output schema, adaptive thinking at high effort, server-side refusal fallbacks, no tools
 * and no Files API. Logs only codes, the model and sizes, never prompt, material or answer.
 */
export function createAnthropicNarrativeGenerator({ apiKey, client }: { apiKey?: string; client?: Anthropic } = {}): NarrativeGenerator {
  const anthropic = client ?? new Anthropic({ apiKey, maxRetries: 2 });
  return {
    async write(request) {
      let response;
      try {
        response = await anthropic.beta.messages.parse({
          model: NARRATIVE_MODEL,
          max_tokens: MAX_TOKENS,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "high", format: betaZodOutputFormat(narrativeOutputSchema) },
          system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: buildContent(request) }],
        });
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          const status = error.status ?? 0;
          log.error(`narrative call failed: HTTP ${status}`);
          const transient = status === 0 || status === 408 || status === 409 || status === 429 || status >= 500;
          return err({ code: transient ? "LLM_UNAVAILABLE" : "LLM_REQUEST_REJECTED", message: `The AI call failed (HTTP ${status}).` });
        }
        // A parse failure of the answer, or a network error the SDK did not class.
        log.error(`narrative call threw: ${error instanceof Error ? error.name : typeof error}`);
        return err({ code: "LLM_OUTPUT_INVALID", message: "The AI answer could not be read." });
      }
      const fellBack = servedByFallback(response.usage);
      log.info(`narrative call done: ${response.model}, fell back ${fellBack}, stop ${response.stop_reason}, ${response.usage.output_tokens} output tokens`);
      if (response.stop_reason === "refusal") return err({ code: "LLM_REFUSAL", message: "The AI declined to write this case." });
      if (response.stop_reason === "max_tokens") return err({ code: "LLM_TRUNCATED", message: "The AI answer was cut off." });
      if (response.parsed_output === null || response.parsed_output === undefined) {
        return err({ code: "LLM_OUTPUT_INVALID", message: "The AI answer did not match the schema." });
      }
      return ok({ texts: toTexts(response.parsed_output), model: response.model, fellBack, promptVersion: PROMPT_VERSION });
    },
  };
}
