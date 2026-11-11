import type { ClaimAspect } from "@/modules/generation/domain/document";
import type { ClientTemplateTextKey } from "@/modules/rendering";
import type { Result } from "@/shared/result";

/** The client fields the AI may cite (Story 3.9): the record's name, sector and description, and the brief's parts. */
export const CLIENT_INTRO_FIELDS = ["name", "industry", "description", "context", "solution", "results", "testimonial"] as const;
export type ClientIntroField = (typeof CLIENT_INTRO_FIELDS)[number];

/** A source a client text may cite: a client field it was given, or one of the client's PDFs (its `client_asset` id). */
export type ClientIntroSourceRef = { kind: "client_field"; id: ClientIntroField } | { kind: "asset"; id: string };

/** One client text the AI wrote. */
export interface ClientIntroText {
  text: string;
  aspect?: ClaimAspect;
  sourceRefs: ClientIntroSourceRef[];
}

/**
 * The longest each client text may be, in characters with spaces: what fits the smallest box
 * of `mac-client@1` in every format (the Presentazione Intro's Cliente block, the Carosello
 * Chiusura). The same four texts go on every format. A headline is short; a body one short paragraph.
 */
export const CLIENT_INTRO_TEXT_LIMITS: Readonly<Record<ClientTemplateTextKey, number>> = Object.freeze({
  introHead: 45,
  introBody: 260,
  outroHead: 45,
  outroBody: 260,
});

/**
 * What the client writer reads (Story 3.9, OP 2 for clients): only the client's current text
 * fields (a field left empty is `null`, `""` or `[]`, and is not sent) and its PDFs; no images,
 * videos or other files.
 */
export interface ClientIntroRequest {
  /** The language (NFR13); Italian only for now (owner, 2026-10-27). */
  locale: "it";
  client: {
    name: string;
    /** The sector's label. */
    industry: string | null;
    description: string | null;
    brief: {
      context: string;
      solution: string;
      results: readonly { label: string; value: string }[];
      testimonial: { quote: string; author: string } | null;
    };
  };
  /** The client's PDFs, oldest first: whole, or as their extracted text when over the budget. */
  documents: readonly ({ assetId: string; kind: "pdf"; bytes: Uint8Array } | { assetId: string; kind: "text"; text: string })[];
}

/** The writer's answer: the four texts, the same in every format, and what to record on the revision. */
export interface ClientIntroResult {
  texts: Record<ClientTemplateTextKey, ClientIntroText>;
  model: string;
  fellBack: boolean;
  promptVersion: string;
}

/**
 * Writes a client's intro and closing texts (Story 3.9). Implemented by
 * `adapters/anthropic/client-intro-writer.ts`, wired only in the worker. Errors as the
 * narrative generator's: `LLM_REFUSAL`, `LLM_REQUEST_REJECTED` (not retryable),
 * `LLM_UNAVAILABLE`, `LLM_OUTPUT_INVALID`, `LLM_TRUNCATED` (retryable).
 */
export interface ClientIntroWriter {
  write(request: ClientIntroRequest): Promise<Result<ClientIntroResult>>;
}
