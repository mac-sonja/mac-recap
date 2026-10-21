import { describe, expect, it } from "vitest";
import type { CaseActivity } from "@/modules/case-study";
import { activityLines } from "./activity-lines";

const A = { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Showroom in tasca", code: "LUM-2026-01", status: "draft" as const };
const B = { id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Mattoni", code: "LUM-2026-02", status: "in_review" as const };
let n = 0;
const event = (over: Partial<CaseActivity>): CaseActivity => ({
  id: `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  type: "case_created",
  at: `2026-10-21T10:${String(60 - n).padStart(2, "0")}:00Z`,
  data: {},
  actorName: "Giulia Riva",
  case: A,
  ...over,
});

describe("activityLines", () => {
  it("says who did what to which case, one line per kind of change", () => {
    const lines = activityLines([
      event({ type: "transition", data: { event: "approve" }, actorName: "Paolo Greco", case: B }),
      event({ type: "transition", data: { event: "generation_succeeded" }, actorName: null, case: B }),
      event({ type: "transition", data: { event: "generate" }, case: B }),
      event({ type: "case_details_updated" }),
      event({ type: "asset_removed" }),
      event({ type: "case_created" }),
    ]);
    expect(lines.map((l) => [l.kind, l.template])).toEqual([
      ["approved", "Paolo Greco ha approvato {name}."],
      ["generated", "La bozza di {name} è pronta da rivedere."],
      ["generate", "Giulia Riva ha avviato la bozza di {name}."],
      ["detailsUpdated", "Giulia Riva ha aggiornato i dettagli di {name}."],
      ["removed", "Giulia Riva ha tolto un file da {name}."],
      ["created", "Giulia Riva ha creato {name}."],
    ]);
  });

  it("folds a run of the same change by the same person on the same case into one line, dated by the newest", () => {
    const newest = event({ type: "asset_uploaded" });
    const lines = activityLines([
      newest,
      event({ type: "asset_uploaded" }),
      event({ type: "asset_uploaded" }),
      event({ type: "details_saved" }),
      event({ type: "details_saved" }),
      event({ type: "asset_uploaded", actorName: "Luca Bassi" }),
      event({ type: "asset_uploaded", case: B }),
    ]);
    expect(lines.map((l) => l.template)).toEqual([
      "Giulia Riva ha caricato 3 file in {name}.",
      "Giulia Riva ha scritto il racconto di {name}.",
      "Luca Bassi ha caricato un file in {name}.",
      "Giulia Riva ha caricato un file in {name}.",
    ]);
    expect(lines[0]).toMatchObject({ id: newest.id, at: newest.at, caseName: A.name });
  });

  it("skips transitions it can't name, and reads a name with $ as written", () => {
    const lines = activityLines([
      event({ type: "transition", data: { event: "fork" } }),
      event({ type: "case_created", actorName: "Ann $& Co" }),
    ]);
    expect(lines.map((l) => l.template)).toEqual(["Ann $& Co ha creato {name}."]);
  });
});
