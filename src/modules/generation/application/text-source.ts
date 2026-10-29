import { testDraftTexts, type DraftText, type TestDraftForm } from "@/modules/generation/application/test-draft";
import type { TemplateTextKey } from "@/modules/rendering";
import { ok, type Result } from "@/shared/result";

/** What a text source reads: the case's details form and the ids of the assets it may cite (the job's manifest). */
export interface TextSourceInput {
  form: TestDraftForm;
  /** The manifest's assets still live, oldest first. */
  assetIds: readonly string[];
}

/**
 * The seam between the generate job and whatever writes the document's texts
 * (Story 3.7). Today it is the marked test text of Story 3.10; Story 3.6 swaps in
 * the narrative generator behind the same shape. One distinct text per template key.
 */
export interface TextSource {
  texts(input: TextSourceInput): Promise<Result<Record<TemplateTextKey, DraftText>>>;
}

/** The default text source: Story 3.10's fixed texts, each marked "[bozza di prova]". No LLM. */
export const testDraftTextSource: TextSource = {
  texts: async ({ form, assetIds }) => ok(testDraftTexts(form, assetIds)),
};
