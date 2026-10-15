// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/(tool)/case-studies/actions";
import type { DetailsFieldSaved, DetailsForm } from "@/modules/material";

const saveDetailsField = vi.fn<(input: unknown) => Promise<ActionResult<DetailsFieldSaved>>>();
const push = vi.fn();

vi.mock("@/app/(tool)/case-studies/actions", () => ({
  saveDetailsField: (input: unknown) => saveDetailsField(input),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { DetailsStep, DEBOUNCE_MS } = await import("./details-step");

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const EMPTY: DetailsForm = { context: "", solution: "", results: "" };
const STEP_3 = `/case-studies/new?caseId=${CASE_ID}&step=3`;

const okSave = async (input: unknown) => {
  const { field, text } = input as DetailsFieldSaved;
  return { ok: true as const, value: { field, text } };
};
const failSave = async () => ({ ok: false as const, status: 500, error: { code: "DETAILS_WRITE_FAILED", message: "down" } });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const setup = (initial: DetailsForm = EMPTY, maxChars = 5000) =>
  render(<DetailsStep caseId={CASE_ID} initial={initial} maxChars={maxChars} />);

const field = (label: "Contesto" | "Soluzione" | "Risultati") => screen.getByLabelText(label) as HTMLTextAreaElement;
const type = (label: "Contesto" | "Soluzione" | "Risultati", text: string) => fireEvent.change(field(label), { target: { value: text } });
const flush = () => act(async () => {});
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  saveDetailsField.mockReset();
  saveDetailsField.mockImplementation(okSave);
  push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DetailsStep", () => {
  it("shows the heading, intro, three labelled fields with their prompts, and the saved answers", () => {
    setup({ context: "Lumen voleva un'identità unica.", solution: "", results: "" });
    expect(screen.getByRole("heading", { level: 2, name: "Racconta il progetto" })).toBeTruthy();
    expect(screen.getByText("Tre campi facoltativi. Servono come fonte, ma da soli non bastano per generare.")).toBeTruthy();
    expect(field("Contesto").value).toBe("Lumen voleva un'identità unica.");
    expect(field("Contesto").placeholder).toBe("Di cosa aveva bisogno il cliente, e perché?");
    expect(field("Soluzione").placeholder).toBe("Cosa avete fatto, e come?");
    expect(field("Risultati").placeholder).toBe("Cosa è cambiato? Indica i numeri dove li hai.");
    expect(screen.getAllByRole("textbox").map((t) => t.getAttribute("name"))).toEqual(["context", "solution", "results"]);
    expect(screen.getByText("1 di 3 compilati").className).toContain("font-mono");
    expect(field("Contesto").className).toContain("min-h-[120px]");
    expect(saveDetailsField).not.toHaveBeenCalled();
  });

  it("saves once after a pause and updates the counter", async () => {
    setup();
    type("Soluzione", "Un solo logotipo");
    expect(screen.getByText("1 di 3 compilati")).toBeTruthy();
    await wait(DEBOUNCE_MS - 1);
    type("Soluzione", "Un solo logotipo e due registri");
    await wait(DEBOUNCE_MS - 1);
    expect(saveDetailsField).not.toHaveBeenCalled();
    await wait(1);
    expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, field: "solution", text: "Un solo logotipo e due registri" });
    await wait(DEBOUNCE_MS * 2);
    expect(saveDetailsField).toHaveBeenCalledTimes(1);
  });

  it("saves at once on blur, flushing the pending debounce", async () => {
    setup();
    type("Contesto", "Tre marchi");
    fireEvent.blur(field("Contesto"));
    await flush();
    expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, field: "context", text: "Tre marchi" });
    await wait(DEBOUNCE_MS * 2);
    expect(saveDetailsField).toHaveBeenCalledTimes(1);
  });

  it('saves a cleared field as "" and the counter drops', async () => {
    setup({ context: "Testo", solution: "", results: "" });
    type("Contesto", "");
    fireEvent.blur(field("Contesto"));
    await flush();
    expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, field: "context", text: "" });
    expect(screen.getByText("0 di 3 compilati")).toBeTruthy();
  });

  it("sends nothing on a blur without a change, or when the text is back to the saved one", async () => {
    setup({ context: "Testo", solution: "", results: "" });
    fireEvent.blur(field("Contesto"));
    type("Risultati", "x");
    type("Risultati", "");
    fireEvent.blur(field("Risultati"));
    await wait(DEBOUNCE_MS * 2);
    expect(saveDetailsField).not.toHaveBeenCalled();
  });

  it("never runs two saves for a field at once; text typed meanwhile is saved after", async () => {
    const first = deferred<ActionResult<DetailsFieldSaved>>();
    saveDetailsField.mockImplementationOnce(() => first.promise);
    setup();
    type("Contesto", "uno");
    fireEvent.blur(field("Contesto"));
    await flush();
    type("Contesto", "uno due");
    fireEvent.blur(field("Contesto"));
    type("Contesto", "uno due tre");
    await wait(DEBOUNCE_MS);
    expect(saveDetailsField).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve({ ok: true, value: { field: "context", text: "uno" } }));
    await flush();
    expect(saveDetailsField).toHaveBeenCalledTimes(2);
    expect(saveDetailsField).toHaveBeenLastCalledWith({ caseId: CASE_ID, field: "context", text: "uno due tre" });
    await wait(DEBOUNCE_MS * 2);
    expect(saveDetailsField).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an error result", failSave],
    ["a throw", async () => Promise.reject(new Error("network"))],
  ])("keeps the text after %s, shows and announces the error, and retries on the next edit", async (_label, failure) => {
    saveDetailsField.mockImplementationOnce(failure);
    setup();
    type("Risultati", "+30% vendite");
    fireEvent.blur(field("Risultati"));
    await flush();

    expect(field("Risultati").value).toBe("+30% vendite");
    const error = screen.getByText("Non salvato. Riprova modificando il testo.");
    expect(field("Risultati").getAttribute("aria-describedby")).toBe(error.id);
    expect(field("Risultati").getAttribute("aria-invalid")).toBe("true");
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Risultati: Non salvato. Riprova modificando il testo.");

    type("Risultati", "+30% vendite in un anno");
    await wait(DEBOUNCE_MS);
    expect(saveDetailsField).toHaveBeenCalledTimes(2);
    expect(saveDetailsField).toHaveBeenLastCalledWith({ caseId: CASE_ID, field: "results", text: "+30% vendite in un anno" });
    expect(screen.queryByText("Non salvato. Riprova modificando il testo.")).toBeNull();
    expect(field("Risultati").hasAttribute("aria-invalid")).toBe(false);
  });

  it("retries a failed save on blur", async () => {
    saveDetailsField.mockImplementationOnce(failSave);
    setup();
    type("Contesto", "a");
    fireEvent.blur(field("Contesto"));
    await flush();
    fireEvent.blur(field("Contesto"));
    await flush();
    expect(saveDetailsField).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Non salvato. Riprova modificando il testo.")).toBeNull();
  });

  it("counts the limit in code points: at the limit it saves and shows the limit; over it nothing is sent", async () => {
    setup();
    const atLimit = "😀".repeat(5000);
    type("Contesto", atLimit);
    expect(screen.getByText("Massimo 5000 caratteri.")).toBeTruthy();
    expect(field("Contesto").hasAttribute("aria-invalid")).toBe(false);
    fireEvent.blur(field("Contesto"));
    await flush();
    expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, field: "context", text: atLimit });

    type("Contesto", `${atLimit}a`);
    const message = screen.getByText("Massimo 5000 caratteri.");
    expect(field("Contesto").getAttribute("aria-invalid")).toBe("true");
    expect(field("Contesto").getAttribute("aria-describedby")).toBe(message.id);
    fireEvent.blur(field("Contesto"));
    await wait(DEBOUNCE_MS * 2);
    expect(saveDetailsField).toHaveBeenCalledTimes(1);
  });

  it("Avanti is active with every field empty and goes to step 3 without a save", async () => {
    setup();
    const next = screen.getByRole("button", { name: "Avanti" });
    expect(next.hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(next);
    await flush();
    expect(saveDetailsField).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledExactlyOnceWith(STEP_3);
  });

  it("Avanti flushes pending saves before leaving", async () => {
    const pending = deferred<ActionResult<DetailsFieldSaved>>();
    saveDetailsField.mockImplementationOnce(() => pending.promise);
    setup();
    type("Contesto", "c");
    type("Risultati", "r");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    await flush();
    expect(saveDetailsField).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ ok: true, value: { field: "context", text: "c" } }));
    await flush();
    expect(push).toHaveBeenCalledExactlyOnceWith(STEP_3);
  });

  it("Avanti stays on the step and focuses the field when its save fails", async () => {
    saveDetailsField.mockImplementation(failSave);
    setup();
    type("Soluzione", "s");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    await flush();
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field("Soluzione"));
    expect(screen.getByText("Non salvato. Riprova modificando il testo.")).toBeTruthy();
  });

  it("a stepper link clicked with unsaved text waits for the save, then navigates", async () => {
    const pending = deferred<ActionResult<DetailsFieldSaved>>();
    saveDetailsField.mockImplementationOnce(() => pending.promise);
    render(
      <>
        <a href={`/case-studies/new?caseId=${CASE_ID}&step=1`}>Materiale</a>
        <DetailsStep caseId={CASE_ID} initial={EMPTY} maxChars={5000} />
      </>,
    );
    type("Contesto", "c");
    const link = screen.getByRole("link", { name: "Materiale" });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      link.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    await flush();
    expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, field: "context", text: "c" });
    expect(push).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ ok: true, value: { field: "context", text: "c" } }));
    await flush();
    expect(push).toHaveBeenCalledExactlyOnceWith(`/case-studies/new?caseId=${CASE_ID}&step=1`);
  });

  it("leaves link clicks alone when everything is saved", async () => {
    render(
      <>
        <a href="/case-studies">Indietro</a>
        <DetailsStep caseId={CASE_ID} initial={EMPTY} maxChars={5000} />
      </>,
    );
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    let ownHandlerRan = false;
    screen.getByRole("link", { name: "Indietro" }).addEventListener("click", (event) => {
      ownHandlerRan = true;
      event.preventDefault();
    });
    screen.getByRole("link", { name: "Indietro" }).dispatchEvent(click);
    expect(ownHandlerRan).toBe(true);
    await flush();
    expect(push).not.toHaveBeenCalled();
    expect(saveDetailsField).not.toHaveBeenCalled();
  });

  it("saves a pending edit when the step unmounts", async () => {
    const { unmount } = setup();
    type("Risultati", "r");
    unmount();
    await flush();
    expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, field: "results", text: "r" });
  });

  it("Avanti stays on the step and focuses a field over the limit", async () => {
    setup(EMPTY, 5);
    type("Soluzione", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    await flush();
    expect(push).not.toHaveBeenCalled();
    expect(saveDetailsField).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field("Soluzione"));
  });

  it("flushes a pending edit on beforeunload", async () => {
    setup();
    type("Contesto", "c");
    window.dispatchEvent(new Event("beforeunload"));
    await flush();
    expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, field: "context", text: "c" });
  });

  it("clears the save error when the text is edited back to the saved one", async () => {
    saveDetailsField.mockImplementationOnce(failSave);
    setup({ context: "saved", solution: "", results: "" });
    type("Contesto", "saved!");
    fireEvent.blur(field("Contesto"));
    await flush();
    expect(screen.getByText("Non salvato. Riprova modificando il testo.")).toBeTruthy();
    type("Contesto", "saved");
    fireEvent.blur(field("Contesto"));
    await flush();
    expect(saveDetailsField).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Non salvato. Riprova modificando il testo.")).toBeNull();
    expect(field("Contesto").hasAttribute("aria-invalid")).toBe(false);
  });

  it("shows the save error, not the limit, when a save at exactly the limit fails", async () => {
    saveDetailsField.mockImplementationOnce(failSave);
    setup(EMPTY, 5);
    type("Risultati", "12345");
    expect(screen.getByText("Massimo 5 caratteri.")).toBeTruthy();
    fireEvent.blur(field("Risultati"));
    await flush();
    const error = screen.getByText("Non salvato. Riprova modificando il testo.");
    expect(field("Risultati").getAttribute("aria-describedby")).toBe(error.id);
    expect(screen.queryByText("Massimo 5 caratteri.")).toBeNull();
  });

  it("retries a failed save on unmount", async () => {
    saveDetailsField.mockImplementationOnce(failSave);
    const { unmount } = setup();
    type("Risultati", "r");
    fireEvent.blur(field("Risultati"));
    await flush();
    expect(saveDetailsField).toHaveBeenCalledTimes(1);
    unmount();
    await flush();
    expect(saveDetailsField).toHaveBeenCalledTimes(2);
    expect(saveDetailsField).toHaveBeenLastCalledWith({ caseId: CASE_ID, field: "results", text: "r" });
  });
});
