import type { CaseActivity } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";

/** What an *Attività* line says, which drives its icon. */
export type ActivityKind =
  | "created"
  | "detailsUpdated"
  | "storyWritten"
  | "uploaded"
  | "removed"
  | "generate"
  | "generated"
  | "generationFailed"
  | "approved";

export interface ActivityLine {
  /** The newest event's id: a stable key. */
  id: string;
  kind: ActivityKind;
  /** The sentence with `{name}` left in, for the case name in bold; `{actor}` and `{n}` are filled. */
  template: string;
  caseId: string;
  caseName: string;
  caseStatus: CaseActivity["case"]["status"];
  /** The newest event of the run. */
  at: string;
}

/** A `transition` event's kind by its `data.event`; unknown events are not shown. */
const TRANSITION_KINDS: Readonly<Record<string, ActivityKind>> = {
  generate: "generate",
  generation_succeeded: "generated",
  generation_failed: "generationFailed",
  approve: "approved",
};

function kindOf(event: CaseActivity): ActivityKind | null {
  switch (event.type) {
    case "case_created":
      return "created";
    case "case_details_updated":
      return "detailsUpdated";
    case "details_saved":
      return "storyWritten";
    case "asset_uploaded":
      return "uploaded";
    case "asset_removed":
      return "removed";
    case "transition": {
      const name = event.data.event;
      return typeof name === "string" ? (TRANSITION_KINDS[name] ?? null) : null;
    }
  }
}

function templateOf(kind: ActivityKind, count: number): string {
  const lines = it.home.activity;
  if (kind === "uploaded") return count === 1 ? lines.uploadedOne : lines.uploaded;
  if (kind === "removed") return count === 1 ? lines.removedOne : lines.removed;
  return lines[kind];
}

/**
 * Turns the event log (newest first) into *Attività* lines: one per event, except
 * that a run of the same kind by the same person on the same case becomes one line
 * (five uploads in a row read "ha caricato 5 file", every autosave of the texts
 * "ha scritto il racconto"), dated by its newest event. Without a name (the system)
 * the actor reads as the app.
 */
export function activityLines(events: readonly CaseActivity[]): ActivityLine[] {
  const runs: { line: Omit<ActivityLine, "template">; actor: string; count: number }[] = [];
  for (const event of events) {
    const kind = kindOf(event);
    if (kind === null) continue;
    const actor = event.actorName ?? it.app.name;
    const last = runs.at(-1);
    if (last !== undefined && last.line.kind === kind && last.line.caseId === event.case.id && last.actor === actor) {
      last.count += 1;
      continue;
    }
    runs.push({
      line: { id: event.id, kind, caseId: event.case.id, caseName: event.case.name, caseStatus: event.case.status, at: event.at },
      actor,
      count: 1,
    });
  }
  return runs.map(({ line, actor, count }) => ({
    ...line,
    // Replacer functions: a `$` in a person's name is never read as a replacement pattern.
    template: templateOf(line.kind, count)
      .replace("{actor}", () => actor)
      .replace("{n}", () => String(count)),
  }));
}
