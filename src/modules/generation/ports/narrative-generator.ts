import type { ClaimAspect } from "@/modules/generation/domain/document";
import type { FormatId, TemplateTextKey } from "@/modules/rendering";
import type { Result } from "@/shared/result";

/** A source the AI may cite (Story 3.6): a file of the manifest, a details-form field or a client field. */
export type NarrativeSourceRef =
  | { kind: "asset"; id: string }
  | { kind: "form_field"; id: "context" | "solution" }
  | { kind: "client_field"; id: "description" | "industry" | "context" | "solution" | "results" };

/** One text the AI wrote. */
export interface NarrativeText {
  text: string;
  aspect?: ClaimAspect;
  sourceRefs: NarrativeSourceRef[];
}

/** What the generator reads: only the job's material, the form answers and the client's current info, as text or bytes. */
export interface NarrativeRequest {
  /** The narrative language (NFR13); Italian only for now (owner, 2026-10-27). */
  locale: "it";
  form: { context: string; solution: string; results: readonly { label: string; value: string }[] };
  client: {
    name: string;
    industry: string | null;
    description: string | null;
    brief: { context: string; solution: string; results: readonly { label: string; value: string }[] };
  } | null;
  /** Documents, oldest first: a PDF as it is, or the text extracted from a DOCX, TXT, MD or oversized PDF. */
  documents: readonly ({ assetId: string; kind: "pdf"; bytes: Uint8Array } | { assetId: string; kind: "text"; text: string })[];
  /** Images as their display renditions, favourites first. */
  images: readonly { assetId: string; mediaType: "image/webp" | "image/png" | "image/jpeg"; bytes: Uint8Array }[];
}

/** The generator's answer: the texts of each format and what to record on the revision. */
export interface NarrativeResult {
  texts: Record<FormatId, Partial<Record<TemplateTextKey, NarrativeText>>>;
  model: string;
  fellBack: boolean;
  promptVersion: string;
}

/**
 * The only port that calls an LLM (Story 3.6, AR7). Implemented by
 * `adapters/anthropic/narrative-generator.ts`, wired only in the worker. Errors:
 * `LLM_REFUSAL` (not retryable), `LLM_UNAVAILABLE`, `LLM_OUTPUT_INVALID`, `LLM_TRUNCATED`
 * (retryable).
 */
export interface NarrativeGenerator {
  write(request: NarrativeRequest): Promise<Result<NarrativeResult>>;
}

/** Text out of documents the API does not read as they are (Story 3.6). Implemented by `adapters/documents/`. */
export interface DocumentReader {
  docxText(bytes: Uint8Array): Promise<string>;
  pdfPageCount(bytes: Uint8Array): Promise<number>;
  pdfText(bytes: Uint8Array): Promise<string>;
}
