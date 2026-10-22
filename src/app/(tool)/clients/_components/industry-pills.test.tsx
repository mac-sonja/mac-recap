// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IndustryPills } from "./industry-pills";

const OPTIONS = [
  { key: "interior_design", label: "Interior design" },
  { key: "energia", label: "Energia" },
  { key: "risorse_umane", label: "Risorse umane" },
  { key: "lusso", label: "Lusso" },
  { key: "nautica", label: "Nautica" },
];

function Controlled({ initial = null as string | null }) {
  const [selected, setSelected] = useState<string | null>(initial);
  return <IndustryPills options={OPTIONS} selected={selected} onSelect={setSelected} labelledBy="label" />;
}

describe("IndustryPills", () => {
  afterEach(cleanup);

  it("is a labelled radio group in list order; the selected one has the lime tint and a check", () => {
    const html = renderToStaticMarkup(
      <IndustryPills options={OPTIONS} selected="lusso" onSelect={() => undefined} labelledBy="label" describedBy="error" />,
    );
    expect(html).toMatch(/^<div role="radiogroup" aria-labelledby="label" aria-describedby="error" aria-required="true"/);
    const radios = [...html.matchAll(/<button type="button" role="radio" aria-checked="(true|false)" tabindex="(-1|0)" class="([^"]*)">(?:<svg.*?<\/svg>)?([^<]*)<\/button>/g)];
    expect(radios.map((m) => [m[4], m[1], m[2]])).toEqual([
      ["Interior design", "false", "-1"],
      ["Energia", "false", "-1"],
      ["Risorse umane", "false", "-1"],
      ["Lusso", "true", "0"],
      ["Nautica", "false", "-1"],
    ]);
    expect(radios[0][3]).toContain("rounded-full");
    expect(radios[0][3]).toContain("aria-checked:bg-primary-tint");
    expect(radios[0][3]).toContain("aria-checked:text-primary-ink");
    expect(radios[3][0]).toContain("<svg");
    expect(radios[0][0]).not.toContain("<svg");
  });

  it("uses the small grey choice pill when editable (owner's mock): 28px tall, 13px text, about 8px apart; the read-only list stays small", () => {
    const html = renderToStaticMarkup(<IndustryPills options={OPTIONS} selected={null} onSelect={() => undefined} />);
    const classes = html.match(/<button [^>]*class="([^"]*)"/)?.[1].split(" ") ?? [];
    expect(classes).toEqual(expect.arrayContaining(["min-h-7", "px-2.5", "py-1", "text-[13px]", "bg-surface-control"]));
    expect(classes).not.toContain("text-xs");
    expect(html).toMatch(/^<div role="radiogroup" aria-required="true" class="flex flex-wrap gap-2 [^"]*aria-invalid:outline-danger/);
    // Nothing selected: the first pill is the one tab stop.
    expect([...html.matchAll(/tabindex="(-1|0)"/g)].map((m) => m[1])).toEqual(["0", "-1", "-1", "-1", "-1"]);
    const readOnly = renderToStaticMarkup(<IndustryPills options={OPTIONS} selected="lusso" label="Settore" />);
    expect(readOnly).toContain('<ul aria-label="Settore" class="flex flex-wrap gap-1.5"><li class="inline-flex items-center rounded-full bg-surface-control px-2.5 py-1 font-label text-xs font-medium text-foreground">Lusso</li>');
  });

  it("read-only, shows only the selected sector's label (an added one too)", () => {
    const html = renderToStaticMarkup(<IndustryPills options={OPTIONS} selected="nautica" label="Settore" />);
    expect(html).not.toContain("<button");
    expect([...html.matchAll(/<li [^>]*>([^<]*)<\/li>/g)].map((m) => m[1])).toEqual(["Nautica"]);
    expect(html).toContain('aria-label="Settore"');
  });

  it("selects one at a time: clicking another switches", () => {
    render(<Controlled initial="energia" />);
    fireEvent.click(screen.getByRole("radio", { name: "Lusso" }));
    expect(screen.getByRole("radio", { name: "Lusso" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("radio").filter((radio) => radio.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  it("arrow keys move the selection and the focus, wrapping; Home and End jump", () => {
    render(<Controlled initial="lusso" />);
    const radio = (name: string) => screen.getByRole("radio", { name });
    radio("Lusso").focus();
    fireEvent.keyDown(radio("Lusso"), { key: "ArrowRight" });
    expect(radio("Nautica").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radio("Nautica"));
    fireEvent.keyDown(radio("Nautica"), { key: "ArrowDown" });
    expect(radio("Interior design").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(radio("Interior design"), { key: "ArrowLeft" });
    expect(radio("Nautica").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(radio("Nautica"), { key: "Home" });
    expect(document.activeElement).toBe(radio("Interior design"));
    fireEvent.keyDown(radio("Interior design"), { key: "End" });
    expect(radio("Nautica").getAttribute("aria-checked")).toBe("true");
    expect(radio("Nautica").tabIndex).toBe(0);
    expect(screen.getAllByRole("radio").filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it("read-only, renders nothing when the client's sector isn't in the list", () => {
    expect(renderToStaticMarkup(<IndustryPills options={OPTIONS} selected="sparito" label="Settore" />)).toBe("");
    expect(renderToStaticMarkup(<IndustryPills options={OPTIONS} selected={null} label="Settore" />)).toBe("");
  });

  it("marks a refused group invalid", () => {
    const html = renderToStaticMarkup(<IndustryPills options={OPTIONS} selected={null} onSelect={() => undefined} invalid />);
    expect(html).toMatch(/^<div role="radiogroup" aria-required="true" aria-invalid="true"/);
  });

  it("leaves arrows with Alt, Ctrl, Meta or Shift to the browser", () => {
    const onSelect = vi.fn();
    render(<IndustryPills options={OPTIONS} selected="lusso" onSelect={onSelect} />);
    for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
      const event = fireEvent.keyDown(screen.getByRole("radio", { name: "Lusso" }), { key: "ArrowRight", [modifier]: true });
      expect(event).toBe(true);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("disabled (a save running), neither keys nor clicks change the selection or move focus", () => {
    const onSelect = vi.fn();
    render(<IndustryPills options={OPTIONS} selected="lusso" onSelect={onSelect} disabled />);
    const lusso = screen.getByRole("radio", { name: "Lusso" });
    lusso.focus();
    fireEvent.keyDown(lusso, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("radio", { name: "Energia" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(lusso);
  });

  it("ignores other keys", () => {
    const onSelect = vi.fn();
    render(<IndustryPills options={OPTIONS} selected="lusso" onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Lusso" }), { key: "a" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
