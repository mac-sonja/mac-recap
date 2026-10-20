import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CASE_STATUSES } from "@/modules/access";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it.each([
    ["draft", "Bozza", "status-draft"],
    ["generating", "In creazione", "status-generating"],
    ["in_review", "Da rivedere", "status-review"],
    ["approved", "Approvata", "status-approved"],
  ] as const)("%s shows %s tinted from the %s tokens", (status, label, token) => {
    const html = renderToStaticMarkup(<StatusBadge status={status} />);
    expect(html).toContain(`>${label}</span>`);
    expect(html).toContain(`bg-${token}-tint`);
    expect(html).toContain(`text-${token}-foreground`);
    expect(html).toContain(`before:bg-${token}`);
  });

  it("keeps the badge text size next to the status colour", () => {
    expect(renderToStaticMarkup(<StatusBadge status="draft" />)).toContain("text-badge");
  });

  it("is a single pill with its label; the dot is a pseudo-element", () => {
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
