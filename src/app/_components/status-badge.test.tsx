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
  ] as const)("%s shows %s with the %s token", (status, label, token) => {
    const html = renderToStaticMarkup(<StatusBadge status={status} />);
    expect(html).toContain(`>${label}</span>`);
    expect(html).toContain(`bg-${token}`);
    expect(html).toContain(`border-${token}`);
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
