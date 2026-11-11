import { clientIntroTestTexts, type ClientDraftTexts } from "@/modules/generation/application/client-intro-draft";
import { sameInEveryFormat, testDraftTexts, type FormatDraftTexts, type TestDraftForm } from "@/modules/generation/application/test-draft";
import { ok, type Result } from "@/shared/result";

/** One live asset of the job's manifest, as the text source sees it (no file name, no bytes). */
export interface SourceAsset {
  id: string;
  kind: "image" | "video" | "document" | "text";
  contentType: string;
  sizeBytes: number;
  isFavourite: boolean;
}

/** What a text source reads: the case, its details form and the manifest's assets still live, oldest first. */
export interface TextSourceInput {
  caseId: string;
  form: TestDraftForm;
  assets: readonly SourceAsset[];
}

/** Recorded on the revision: the served model, whether a fallback model served it, and the prompt version (all null for the test text). */
export interface TextSourceMeta {
  model: string | null;
  fellBack: boolean;
  promptVersion: string | null;
}

/** A text source's failure: an UPPER_CASE code and whether the job may retry. */
export interface TextSourceError {
  code: Uppercase<string>;
  message: string;
  retryable: boolean;
}

/**
 * The seam between the generate job and whatever writes the document's texts
 * (Story 3.7). Story 3.6's narrative generator writes one text per template key
 * and format; the marked test text of Story 3.10 stays the default (no API key).
 */
export interface TextSource {
  texts(input: TextSourceInput): Promise<Result<{ texts: FormatDraftTexts; meta: TextSourceMeta }, TextSourceError>>;
}

/** The default text source: Story 3.10's fixed texts, each marked "[bozza di prova]", the same in every format. No LLM. */
export const testDraftTextSource: TextSource = {
  texts: async ({ form, assets }) =>
    ok({
      texts: sameInEveryFormat(testDraftTexts(form, assets.map((a) => a.id))),
      meta: { model: null, fellBack: false, promptVersion: null },
    }),
};

/** A client's current data as a client text source reads it (Story 3.9): its record and brief, and its live files. */
export interface ClientTextSourceInput {
  clientId: string;
  client: {
    name: string;
    /** The sector's key, or null. */
    industry: string | null;
    description: string | null;
    brief: {
      context: string;
      solution: string;
      results: readonly { label: string; value: string }[];
      testimonialQuote: string;
      testimonialAuthor: string;
    };
  };
  /** The client's live files in `position` order (no file name, no bytes). */
  assets: readonly { id: string; kind: string; contentType: string }[];
}

/**
 * The seam between a client intro's generate job and whatever writes its four texts (Story
 * 3.9): the AI when `ANTHROPIC_API_KEY` is set, else Story 3.11's marked test text.
 */
export interface ClientTextSource {
  texts(input: ClientTextSourceInput): Promise<Result<{ texts: ClientDraftTexts; meta: TextSourceMeta }, TextSourceError>>;
}

/** The default client text source: Story 3.11's test texts, each marked "[bozza di prova]". No LLM. */
export const clientTestTextSource: ClientTextSource = {
  texts: async ({ client }) =>
    ok({
      texts: clientIntroTestTexts({ description: client.description, context: client.brief.context }),
      meta: { model: null, fellBack: false, promptVersion: null },
    }),
};
