// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessLine } from "@/modules/case-study";
import { BusinessLinePills } from "./business-line-pills";

const OPTIONS: BusinessLine[] = ["branding", "social_media", "video", "web_design", "advertising", "eventi", "sviluppo"];

function Harness({ initial = [], disabled, onToggle }: { initial?: BusinessLine[]; disabled?: boolean; onToggle?: (value: BusinessLine) => void }) {
  const [selected, setSelected] = useState<readonly BusinessLine[]>(initial);
  return (
    <>
      <span id="label">Servizi</span>
      <BusinessLinePills
        options={OPTIONS}
        selected={selected}
        onToggle={(value) => {
          onToggle?.(value);
          setSelected((current) => (current.includes(value) ? current.filter((line) => line !== value) : [...current, value]));
        }}
        labelledBy="label"
        disabled={disabled}
      />
    </>
  );
}

const pills = () => screen.getAllByRole("button");
const pressed = () => pills().filter((p) => p.getAttribute("aria-pressed") === "true").map((p) => p.textContent);

afterEach(cleanup);

describe("BusinessLinePills", () => {
  it("uses grey filled chips (owner's mock, 2026-10-21), about 8px apart", () => {
    render(<Harness />);
    for (const pill of pills()) {
      expect(pill.className.split(" ")).toEqual(expect.arrayContaining(["min-h-9", "bg-surface-control", "border-transparent", "text-[13px]"]));
    }
    expect(screen.getByRole("group").className).toBe("flex flex-wrap gap-2");
  });

  it("is a named group of the seven Servizi as toggle buttons, none pressed, each in the tab order", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Servizi" })).toBeTruthy();
    expect(pills().map((p) => p.textContent)).toEqual(["Branding", "Social media", "Video", "Web design", "Advertising", "Eventi", "Sviluppo"]);
    expect(pressed()).toEqual([]);
    expect(pills().every((p) => p.tabIndex === 0)).toBe(true);
  });

  it("switches several on (multi-select) and one off again", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["video"]} />);
    expect(pressed()).toEqual(["Video"]);
    await user.click(screen.getByRole("button", { name: "Branding" }));
    await user.click(screen.getByRole("button", { name: "Eventi" }));
    expect(pressed()).toEqual(["Branding", "Video", "Eventi"]);
    await user.click(screen.getByRole("button", { name: "Video" }));
    expect(pressed()).toEqual(["Branding", "Eventi"]);
  });

  it("switches with Space and Enter from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    await user.keyboard(" ");
    await user.tab();
    await user.keyboard("{Enter}");
    expect(pressed()).toEqual(["Branding", "Social media"]);
  });

  it("switches nothing while disabled", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<Harness disabled onToggle={onToggle} />);
    await user.click(screen.getByRole("button", { name: "Video" }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(pills().every((p) => p.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("has no aria-disabled while enabled", () => {
    render(<Harness />);
    expect(pills().some((p) => p.hasAttribute("aria-disabled"))).toBe(false);
  });
});
