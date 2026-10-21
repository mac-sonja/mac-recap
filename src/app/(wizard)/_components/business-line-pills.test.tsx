// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessLine } from "@/modules/case-study";
import { BusinessLinePills } from "./business-line-pills";

const OPTIONS: BusinessLine[] = ["branding", "social_media", "video", "web_design", "advertising", "eventi", "sviluppo"];

function Harness({ initial = null, onSelect }: { initial?: BusinessLine | null; onSelect?: (value: BusinessLine) => void }) {
  const [selected, setSelected] = useState<BusinessLine | null>(initial);
  return (
    <>
      <span id="label">Area</span>
      <BusinessLinePills
        options={OPTIONS}
        selected={selected}
        onSelect={(value) => {
          onSelect?.(value);
          setSelected(value);
        }}
        labelledBy="label"
      />
    </>
  );
}

const radios = () => screen.getAllByRole("radio");
const checked = () => radios().filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.textContent);

afterEach(cleanup);

describe("BusinessLinePills", () => {
  it("uses grey filled chips (owner's mock, 2026-10-21), about 8px apart", () => {
    render(<Harness />);
    for (const radio of radios()) {
      expect(radio.className.split(" ")).toEqual(expect.arrayContaining(["min-h-9", "bg-surface-control", "border-transparent", "text-[13px]"]));
    }
    expect(screen.getByRole("radiogroup").className).toBe("flex flex-wrap gap-2");
  });

  it("is a named radiogroup of the seven business lines, none checked, the first in the tab order", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Area" })).toBeTruthy();
    expect(radios().map((r) => r.textContent)).toEqual(["Branding", "Social media", "Video", "Web design", "Advertising", "Eventi", "Sviluppo"]);
    expect(checked()).toEqual([]);
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1]);
    // The client industry pill look, with the checked state.
    expect(radios()[0].className).toContain("rounded-full");
    expect(radios()[0].className).toContain("aria-checked:bg-foreground-strong");
  });

  it("picks one on click (single choice); the picked one becomes the tab stop", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Video" }));
    await user.click(screen.getByRole("radio", { name: "Eventi" }));
    expect(checked()).toEqual(["Eventi"]);
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, -1, -1, -1, -1, 0, -1]);
  });

  it("moves and picks with the arrow keys, wrapping, and with Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness initial="branding" />);
    radios()[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(checked()).toEqual(["Social media"]);
    expect(document.activeElement).toBe(radios()[1]);
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(checked()).toEqual(["Sviluppo"]);
    await user.keyboard("{ArrowDown}");
    expect(checked()).toEqual(["Branding"]);
    await user.keyboard("{End}");
    expect(checked()).toEqual(["Sviluppo"]);
    await user.keyboard("{Home}");
    expect(checked()).toEqual(["Branding"]);
  });

  it("picks nothing while disabled", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<BusinessLinePills options={OPTIONS} selected={null} onSelect={onSelect} labelledBy="x" disabled />);
    await user.click(screen.getByRole("radio", { name: "Video" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(radios().every((r) => r.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(radios()[0].className).toContain("aria-disabled:opacity-60");
  });

  it("has no aria-disabled while enabled", () => {
    render(<Harness />);
    expect(radios().some((r) => r.hasAttribute("aria-disabled"))).toBe(false);
  });
});
