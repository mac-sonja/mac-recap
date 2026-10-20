// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientRef } from "@/modules/case-study";
import { ClientCombobox, filterClients } from "./client-combobox";

const LUMEN: ClientRef = { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen S.r.l.", code: "LUM" };
const TORINO: ClientRef = { id: "cccccccc-0000-4000-8000-000000000002", name: "Città di Torino", code: "CIT" };
const ACME: ClientRef = { id: "cccccccc-0000-4000-8000-000000000003", name: "Acme", code: "ACM" };
const CLIENTS = [ACME, TORINO, LUMEN];
const FELICITA: ClientRef = { id: "cccccccc-0000-4000-8000-000000000004", name: "Felicità", code: "FEL" };
const CITROEN: ClientRef = { id: "cccccccc-0000-4000-8000-000000000005", name: "Citroën", code: "CTN" };

function Harness({ initial = "", onChange }: { initial?: string; onChange?: (id: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="client">Cliente</label>
      <ClientCombobox
        id="client"
        clients={CLIENTS}
        value={value}
        onChange={(id) => {
          onChange?.(id);
          setValue(id);
        }}
      />
      <output data-testid="value">{value}</output>
    </form>
  );
}

const input = () => screen.getByRole("combobox", { name: "Cliente" }) as HTMLInputElement;
const options = () => screen.queryAllByRole("option").map((o) => o.textContent);
const value = () => screen.getByTestId("value").textContent;
const active = () => {
  const id = input().getAttribute("aria-activedescendant");
  return id === null ? null : document.getElementById(id)?.textContent;
};

afterEach(cleanup);

describe("filterClients", () => {
  it("matches name and code, case- and accent-insensitive", () => {
    expect(filterClients(CLIENTS, "lum")).toEqual([LUMEN]);
    expect(filterClients(CLIENTS, "CITTA")).toEqual([TORINO]);
    expect(filterClients(CLIENTS, "acm")).toEqual([ACME]);
    expect(filterClients(CLIENTS, "  ")).toEqual(CLIENTS);
    expect(filterClients(CLIENTS, "zzz")).toEqual([]);
  });

  it("ranks code prefix, then name prefix, then the rest, each by name", () => {
    expect(filterClients([FELICITA, CITROEN, ACME, TORINO], "CIT")).toEqual([TORINO, CITROEN, FELICITA]);
    expect(filterClients([LUMEN, ACME], "m")).toEqual([ACME, LUMEN]);
  });
});

describe("ClientCombobox", () => {
  it("follows the ARIA combobox pattern: a closed popup listbox, labelled by the field label", () => {
    render(<Harness />);
    const box = input();
    expect(box.getAttribute("aria-expanded")).toBe("false");
    expect(box.getAttribute("aria-autocomplete")).toBe("list");
    expect(box.getAttribute("aria-required")).toBe("true");
    const list = document.getElementById(box.getAttribute("aria-controls") ?? "");
    expect(list?.getAttribute("role")).toBe("listbox");
    expect(list?.hidden).toBe(true);
    expect(box.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("typing filters by name and code and makes the first match active; Enter picks it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), "lum");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(options()).toEqual(["Lumen S.r.l. (LUM)"]);
    expect(active()).toBe("Lumen S.r.l. (LUM)");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(LUMEN.id);
    expect(value()).toBe(LUMEN.id);
    expect(input().value).toBe("Lumen S.r.l. (LUM)");
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("arrow keys open the list and move the active option, wrapping; the picked option is selected", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(input());
    expect(options()).toEqual(["Acme (ACM)", "Città di Torino (CIT)", "Lumen S.r.l. (LUM)"]);
    await user.keyboard("{Escape}");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    await user.keyboard("{ArrowDown}");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(active()).toBe("Acme (ACM)");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(active()).toBe("Lumen S.r.l. (LUM)");
    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("Acme (ACM)");
    await user.keyboard("{ArrowUp}");
    expect(active()).toBe("Lumen S.r.l. (LUM)");
    await user.keyboard("{Enter}");
    expect(value()).toBe(LUMEN.id);
    // Reopened, the list shows every client, the picked one selected and active.
    await user.keyboard("{ArrowDown}");
    expect(options()).toHaveLength(3);
    expect(active()).toBe("Lumen S.r.l. (LUM)");
    expect(screen.getByRole("option", { name: "Lumen S.r.l. (LUM)" }).getAttribute("aria-selected")).toBe("true");
  });

  it("Escape closes the list; a second Escape clears the text and the pick", async () => {
    const user = userEvent.setup();
    render(<Harness initial={LUMEN.id} />);
    expect(input().value).toBe("Lumen S.r.l. (LUM)");
    await user.click(input());
    expect(input().getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(value()).toBe(LUMEN.id);
    await user.keyboard("{Escape}");
    expect(input().value).toBe("");
    expect(value()).toBe("");
  });

  it("a click on an option picks it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "t");
    await user.click(screen.getByRole("option", { name: "Città di Torino (CIT)" }));
    expect(value()).toBe(TORINO.id);
    expect(input().value).toBe("Città di Torino (CIT)");
  });

  it("focus selects the picked label, so typing replaces it and clears the pick", async () => {
    const user = userEvent.setup();
    render(<Harness initial={LUMEN.id} />);
    await user.tab();
    expect(document.activeElement).toBe(input());
    expect([input().selectionStart, input().selectionEnd]).toEqual([0, "Lumen S.r.l. (LUM)".length]);
    await user.keyboard("ac");
    expect(input().value).toBe("ac");
    expect(value()).toBe("");
    expect(options()).toEqual(["Acme (ACM)"]);
  });

  it("leaving with nothing picked clears a text that names no single client", async () => {
    const user = userEvent.setup();
    render(<Harness initial={LUMEN.id} />);
    await user.tab();
    await user.keyboard("a");
    await user.tab();
    expect(input().value).toBe("");
    expect(value()).toBe("");
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("leaving with a text that names exactly one client picks it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "lu");
    await user.tab();
    expect(input().value).toBe("");
    await user.type(input(), "LUM");
    await user.tab();
    expect(value()).toBe(LUMEN.id);
    expect(input().value).toBe("Lumen S.r.l. (LUM)");
  });

  it("leaving with a client still picked shows its label again", async () => {
    const user = userEvent.setup();
    render(<Harness initial={LUMEN.id} />);
    await user.click(input());
    await user.keyboard("{ArrowDown}");
    await user.tab();
    expect(value()).toBe(LUMEN.id);
    expect(input().value).toBe("Lumen S.r.l. (LUM)");
  });

  it("Enter never submits the form, with the list closed or without a match", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    render(<Harness />);
    input().form?.addEventListener("submit", onSubmit);
    await user.click(input());
    await user.keyboard("{Escape}{Enter}");
    await user.type(input(), "zzz{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("a press on the list keeps focus on the input", () => {
    render(<Harness />);
    const list = screen.getByRole("listbox", { hidden: true });
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    list.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });

  it("announces the number of matches politely once typing pauses", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const status = document.querySelector('p[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toBe("");
    await user.type(input(), "c");
    expect(await screen.findByText("2 clienti")).toBe(status);
    await user.type(input(), "i");
    expect(await screen.findByText("1 cliente")).toBe(status);
    await user.type(input(), "zz");
    expect(await screen.findByText("Nessun cliente trovato", { selector: "[role=status]" })).toBe(status);
  });

  it("a text with no match says Nessun cliente trovato with a link to Clienti, described on the field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "zzz");
    expect(options()).toEqual([]);
    expect(input().getAttribute("aria-expanded")).toBe("false");
    const note = document.getElementById(input().getAttribute("aria-describedby") ?? "");
    expect(note?.textContent).toBe("Nessun cliente trovato. Aggiungilo nella pagina Clienti.");
    expect(screen.getByRole("link", { name: "pagina Clienti" }).getAttribute("href")).toBe("/clients");
    // Enter with no list submits nothing and picks nothing.
    await user.keyboard("{Enter}");
    expect(value()).toBe("");
  });
});
