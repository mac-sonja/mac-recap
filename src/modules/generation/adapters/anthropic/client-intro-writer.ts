import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { callFailure, FALLBACK_BETA, MAX_TOKENS, NARRATIVE_MODEL, servedByFallback } from "@/modules/generation/adapters/anthropic/narrative-generator";
import { PROMPT_VERSION, systemPrompt } from "@/modules/generation/adapters/prompts/client-intro.v1";
import type {
  ClientIntroRequest,
  ClientIntroResult,
  ClientIntroText,
  ClientIntroWriter,
} from "@/modules/generation/ports/client-intro-writer";
import { CLIENT_TEMPLATE_TEXT_KEYS, type ClientTemplateTextKey } from "@/modules/rendering";
import { log } from "@/shared/log";
import { err, ok } from "@/shared/result";

/** A cited source; whether it was given is checked by the text source (`INVALID_SOURCE_REF`). */
const refSchema = z.object({
  kind: z.enum(["client_field", "asset"]),
  id: z.string(),
});
const textSchema = z.object({
  text: z.string(),
  aspect: z.enum(["technical", "graphic", "none"]),
  sourceRefs: z.array(refSchema),
});

/** Exactly the four client texts, the same in every format. Only text: no layout, asset, about or check field (AR19). */
export const clientIntroOutputSchema = z.object(
  Object.fromEntries(CLIENT_TEMPLATE_TEXT_KEYS.map((key) => [key, textSchema])) as Record<ClientTemplateTextKey, typeof textSchema>,
);
type ClientIntroOutput = z.infer<typeof clientIntroOutputSchema>;

const label = (assetId: string) => `[asset:${assetId}]`;
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** The client's fields as labelled lines; a field left empty is not sent. */
function clientText(request: ClientIntroRequest): string {
  const c = request.client;
  const line = (field: string, value: string | null) => (value === null || value.trim() === "" ? [] : [`client_field ${field}: ${value.trim()}`]);
  const { results, testimonial } = c.brief;
  const lines = [
    "# Scheda cliente",
    ...line("name", c.name),
    ...line("industry", c.industry),
    ...line("description", c.description),
    ...line("context", c.brief.context),
    ...line("solution", c.brief.solution),
    ...(results.length === 0 ? [] : [`client_field results (vanno sulla pagina come sono, non nei tuoi testi): ${results.map((r) => `${r.label}: ${r.value}`).join("; ")}`]),
    ...(testimonial === null ? [] : [`client_field testimonial: «${testimonial.quote.trim()}»${testimonial.author.trim() === "" ? "" : ` (${testimonial.author.trim()})`}`]),
    "",
    `Scrivi i quattro testi in italiano (${request.locale}), seguendo le linee guida e i limiti di lunghezza.`,
  ];
  return lines.join("\n");
}

/** The user turn: each PDF (or its text) after its label, then the client's fields. */
export function buildClientIntroContent(request: ClientIntroRequest): Anthropic.Beta.BetaContentBlockParam[] {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const doc of request.documents) {
    if (doc.kind === "pdf") {
      content.push({ type: "text", text: label(doc.assetId) });
      content.push({ type: "document", title: label(doc.assetId), source: { type: "base64", media_type: "application/pdf", data: base64(doc.bytes) } });
    } else {
      content.push({ type: "text", text: `${label(doc.assetId)}\n${doc.text}` });
    }
  }
  content.push({ type: "text", text: clientText(request) });
  return content;
}

/** The parsed output as the port's texts: `aspect: none` dropped. */
function toTexts(output: ClientIntroOutput): ClientIntroResult["texts"] {
  return Object.fromEntries(
    CLIENT_TEMPLATE_TEXT_KEYS.map((key) => {
      const t = output[key];
      const text: ClientIntroText = { text: t.text, sourceRefs: t.sourceRefs as ClientIntroText["sourceRefs"], ...(t.aspect === "none" ? {} : { aspect: t.aspect }) };
      return [key, text];
    }),
  ) as ClientIntroResult["texts"];
}

/**
 * The Anthropic client intro writer (Story 3.9): as the narrative generator, one
 * `beta.messages.parse` call with the zod output schema, the same model, adaptive thinking at
 * high effort, server-side refusal fallbacks, no tools and no Files API. Logs only codes, the
 * model and sizes, never prompt, client text or answer.
 */
export function createAnthropicClientIntroWriter({ apiKey, client }: { apiKey?: string; client?: Anthropic } = {}): ClientIntroWriter {
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
          output_config: { effort: "high", format: betaZodOutputFormat(clientIntroOutputSchema) },
          system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: buildClientIntroContent(request) }],
        });
      } catch (error) {
        return callFailure(error, "client intro");
      }
      const fellBack = servedByFallback(response.usage);
      log.info(`client intro call done: ${response.model}, fell back ${fellBack}, stop ${response.stop_reason}, ${response.usage.output_tokens} output tokens`);
      if (response.stop_reason === "refusal") return err({ code: "LLM_REFUSAL", message: "The AI declined to write this client's texts." });
      if (response.stop_reason === "max_tokens") return err({ code: "LLM_TRUNCATED", message: "The AI answer was cut off." });
      if (response.parsed_output === null || response.parsed_output === undefined) {
        return err({ code: "LLM_OUTPUT_INVALID", message: "The AI answer did not match the schema." });
      }
      return ok({ texts: toTexts(response.parsed_output), model: response.model, fellBack, promptVersion: PROMPT_VERSION });
    },
  };
}
