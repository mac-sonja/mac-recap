import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CASE_STATUSES } from "@/modules/access";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it.each([
    ["draft", "Bozza", "status-draft"],
    ["generating", "In elaborazione", "status-generating"],
    ["in_review", "Da approvare", "status-review"],
    ["approved", "Approvato", "status-approved"],
  ] as const)("%s shows %s tinted from the %s token", (status, label, token) => {
    const html = renderToStaticMarkup(<StatusBadge status={status} />);
    expect(html).toContain(`>${label}</span>`);
    expect(html).toMatch(new RegExp(`bg-${token}/\\d+`));
    expect(html).toMatch(new RegExp(`border-${token}/\\d+`));
  });

  it("uses info text for Da approvare and the status hue otherwise", () => {
    expect(renderToStaticMarkup(<StatusBadge status="in_review" />)).toContain("text-info");
    expect(renderToStaticMarkup(<StatusBadge status="approved" />)).toContain("text-status-approved");
  });

  it.each([
    ["draft", "bg-status-draft/6 border-status-draft/22 text-status-draft"],
    ["generating", "bg-status-generating/6 border-status-generating/22 text-status-generating"],
    ["in_review", "bg-status-review/16 border-status-review/40 text-info"],
    ["approved", "bg-status-approved/10 border-status-approved/28 text-status-approved"],
  ] as const)("%s uses the DESIGN.md tint %s", (status, tone) => {
    expect(renderToStaticMarkup(<StatusBadge status={status} />)).toContain(tone);
  });

  it("is a single pill with its label and no leading dot", () => {
    expect(renderToStaticMarkup(<StatusBadge status="draft" />)).toMatch(/^<span [^>]*>Bozza<\/span>$/);
  });

  it("covers every case status", () => {
    expect(CASE_STATUSES).toEqual(["draft", "generating", "in_review", "approved"]);
  });

  it("rejects an unknown status at compile time", () => {
    // @ts-expect-error -- not a CaseStatus
    const el = <StatusBadge status="archived" />;
    expect(el).toBeTruthy();
  });
});
