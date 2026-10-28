import type { CaseStudy } from "@/modules/case-study/domain/case-study";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import { log } from "@/shared/log";

/**
 * When each `in_review` case of `cases` entered Da approvare (Story 4.1): the `at` of
 * its newest `transition` event to `in_review`, or its `updatedAt` when it has none.
 * Other statuses are absent. A failed read falls back to `updatedAt` for every case
 * (logged): the queue order is a convenience, never a reason to fail the page.
 */
export function makeReviewSince(cases: CaseStudyRepository) {
  return async function reviewSince(list: readonly CaseStudy[]): Promise<Map<string, string>> {
    const waiting = list.filter((c) => c.status === "in_review");
    const since = new Map<string, string>();
    if (waiting.length === 0) return since;
    const read = await cases.reviewSince(waiting.map((c) => c.id));
    if (!read.ok) log.warn(`review since fell back to updated_at: ${read.error.code}`);
    for (const c of waiting) since.set(c.id, (read.ok ? read.value.get(c.id) : undefined) ?? c.updatedAt);
    return since;
  };
}
