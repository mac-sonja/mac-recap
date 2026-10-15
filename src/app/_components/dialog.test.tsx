// @vitest-environment happy-dom
import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, type DialogProps } from "./dialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const noop = () => {};

function Page({ dialogs }: { dialogs: Array<Partial<DialogProps> & { id: string }> }) {
  return (
    <>
      <button type="button">Apri</button>
      {dialogs.map(({ id, ...props }) => (
        <Dialog
          key={id}
          open={false}
          onClose={noop}
          title={`Titolo ${id}`}
          actions={<button type="button">Annulla {id}</button>}
          {...props}
        />
      ))}
    </>
  );
}

const dialogs = () => Array.from(document.querySelectorAll("dialog"));
const opener = () => screen.getByRole("button", { name: "Apri" });

/** What the browser fires on Escape for a modal dialog. */
function pressEscape(dialog: HTMLDialogElement) {
  const event = new Event("cancel", { cancelable: true });
  dialog.dispatchEvent(event);
  return event;
}

describe("Dialog", () => {
  it("opens modally, labelled by its title, with focus inside", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const { rerender } = render(<Page dialogs={[{ id: "a" }]} />);
    opener().focus();
    rerender(<Page dialogs={[{ id: "a", open: true }]} />);

    const [dialog] = dialogs();
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
    expect(screen.getByRole("dialog", { name: "Titolo a" })).toBe(dialog);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Annulla a" }));
  });

  it("focuses the caller's autofocus element before the first focusable", () => {
    const actions = (
      <>
        <button type="button">Conferma</button>
        <button type="button" data-autofocus>
          Annulla
        </button>
      </>
    );
    render(<Page dialogs={[{ id: "a", open: true, actions }]} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Annulla" }));
  });

  it("focuses the dialog itself when it has nothing focusable", () => {
    render(<Page dialogs={[{ id: "a", open: true, actions: undefined }]} />);
    expect(document.activeElement).toBe(dialogs()[0]);
  });

  it("wires aria-labelledby and aria-describedby", () => {
    render(
      <Page
        dialogs={[
          { id: "a", open: true, description: "Questa azione non si può annullare." },
          { id: "b" },
        ]}
      />,
    );
    const [withDescription, withoutDescription] = dialogs();

    const label = document.getElementById(withDescription.getAttribute("aria-labelledby") ?? "");
    expect(label?.textContent).toBe("Titolo a");
    const description = document.getElementById(withDescription.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toBe("Questa azione non si può annullare.");
    expect(screen.getByRole("dialog", { name: "Titolo a" })).toHaveProperty("open", true);

    expect(withoutDescription.hasAttribute("aria-describedby")).toBe(false);
    expect(document.getElementById(withoutDescription.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Titolo b",
    );
  });

  it("calls onClose once on Esc and stays open until the caller closes it", () => {
    const onClose = vi.fn();
    render(<Page dialogs={[{ id: "a", open: true, onClose }]} />);
    const [dialog] = dialogs();

    const event = pressEscape(dialog);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);
  });

  it("calls onClose once when the browser closes the dialog itself", async () => {
    const onClose = vi.fn();
    render(<Page dialogs={[{ id: "a", open: true, onClose }]} />);

    dialogs()[0].close();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("stays open under StrictMode: a close event from the first effect cleanup is ignored", async () => {
    // Browsers fire `close` as a queued task after close(); model that here.
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      setTimeout(() => this.dispatchEvent(new Event("close")), 0);
    });
    const onClose = vi.fn();
    render(
      <StrictMode>
        <Page dialogs={[{ id: "a", open: true, onClose }]} />
      </StrictMode>,
    );
    // Let any queued `close` event from the double-run effect arrive.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(dialogs()[0].open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close on a backdrop click", async () => {
    const onClose = vi.fn();
    render(<Page dialogs={[{ id: "a", open: true, onClose }]} />);
    const [dialog] = dialogs();

    // A click on the backdrop targets the <dialog> element itself.
    await userEvent.click(dialog);

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
  });

  it("closes when the caller sets open false and returns focus to the opener", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Page dialogs={[{ id: "a", onClose }]} />);
    opener().focus();
    rerender(<Page dialogs={[{ id: "a", open: true, onClose }]} />);
    expect(document.activeElement).not.toBe(opener());

    rerender(<Page dialogs={[{ id: "a", open: false, onClose }]} />);

    expect(dialogs()[0].open).toBe(false);
    expect(document.activeElement).toBe(opener());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("refuses a second dialog while one is open, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(noop);
    const { rerender } = render(<Page dialogs={[{ id: "a", open: true }, { id: "b" }]} />);
    const [first, second] = dialogs();

    rerender(<Page dialogs={[{ id: "a", open: true }, { id: "b", open: true }]} />);

    expect(first.open).toBe(true);
    expect(second.open).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Annulla a" }));
  });

  it("opens the second dialog normally once the first has closed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(noop);
    const { rerender } = render(<Page dialogs={[{ id: "a", open: true }, { id: "b" }]} />);
    const [first, second] = dialogs();

    rerender(<Page dialogs={[{ id: "a" }, { id: "b" }]} />);
    rerender(<Page dialogs={[{ id: "a" }, { id: "b", open: true }]} />);

    expect(first.open).toBe(false);
    expect(second.open).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("releases the single-dialog slot when unmounted while open", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(noop);
    const { rerender } = render(<Page dialogs={[{ id: "a", open: true }, { id: "b" }]} />);

    rerender(<Page dialogs={[{ id: "b" }]} />);
    rerender(<Page dialogs={[{ id: "b", open: true }]} />);

    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].open).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
