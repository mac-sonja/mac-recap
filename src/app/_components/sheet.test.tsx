// @vitest-environment happy-dom
import { useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";
import { Sheet } from "./sheet";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Page({ onClose = () => undefined, withDialog = false }: { onClose?: () => void; withDialog?: boolean }) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Apri
      </button>
      <Sheet
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Nuovo cliente"
        description="Una riga."
        closeLabel="Chiudi"
        footer={<button type="button">Salva</button>}
      >
        <button type="button">Primo</button>
        <input aria-label="Nome" data-autofocus />
        {withDialog && (
          <>
            <button type="button" onClick={() => setInner(true)}>
              Elimina
            </button>
            <Dialog open={inner} onClose={() => setInner(false)} title="Sicuro?" actions={<button type="button">No</button>} />
          </>
        )}
      </Sheet>
    </>
  );
}

const sheet = () => document.querySelector("dialog") as HTMLDialogElement;

/** What the browser fires on Escape for a modal dialog. */
function pressEscape(dialog: HTMLDialogElement) {
  const event = new Event("cancel", { cancelable: true });
  dialog.dispatchEvent(event);
  return event;
}

describe("Sheet", () => {
  it("opens modally at the right edge, labelled and described, with focus on the autofocus element", async () => {
    const user = userEvent.setup();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<Page />);
    expect(sheet().open).toBe(false);
    await user.click(screen.getByRole("button", { name: "Apri" }));
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Nuovo cliente" })).toBe(sheet());
    expect(document.getElementById(sheet().getAttribute("aria-describedby") ?? "")?.textContent).toBe("Una riga.");
    expect(document.activeElement).toBe(screen.getByLabelText("Nome"));
    expect(sheet().className).toContain("ml-auto");
    expect(sheet().className).toContain("h-dvh");
    expect(sheet().className).toContain("w-[500px]");
    expect(sheet().className).toContain("open:motion-safe:animate-sheet-in");
    expect(sheet().querySelector("[data-sheet-footer]")?.textContent).toBe("Salva");
  });

  it("hands Esc and the × to onClose, and returns focus to the opener", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Apri" });
    await user.click(opener);
    let event: Event | undefined;
    act(() => {
      event = pressEscape(sheet());
    });
    expect(event?.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sheet().open).toBe(false);
    expect(document.activeElement).toBe(opener);

    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(opener);
  });

  it("shows itself again and asks onClose when the browser closed it on its own (a repeated Esc)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<Sheet open onClose={onClose} title="T" closeLabel="Chiudi">x</Sheet>);
    await user.click(document.body);
    act(() => {
      sheet().close();
      sheet().dispatchEvent(new Event("close"));
    });
    expect(showModal).toHaveBeenCalledTimes(2);
    expect(sheet().open).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it("lets a Dialog open on top, and an Esc inside that Dialog leaves the sheet open", async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(console, "warn");
    const onClose = vi.fn();
    render(<Page onClose={onClose} withDialog />);
    await user.click(screen.getByRole("button", { name: "Apri" }));
    await user.click(screen.getByRole("button", { name: "Elimina" }));
    const inner = screen.getByRole("dialog", { name: "Sicuro?" }) as HTMLDialogElement;
    expect(inner.open).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    act(() => void pressEscape(inner));
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet().open).toBe(true);
  });
});
