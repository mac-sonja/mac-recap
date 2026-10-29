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
