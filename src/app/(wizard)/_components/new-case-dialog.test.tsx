// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientRef } from "@/modules/case-study";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));
const createCaseStudy = vi.fn();
vi.mock("@/app/(tool)/case-studies/actions", () => ({ createCaseStudy: (input: unknown) => createCaseStudy(input) }));

// happy-dom has no modal dialogs: showModal/close just toggle `open`.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false;
};

const { NewCaseDialog } = await import("./new-case-dialog");

const ORTICA: ClientRef = { id: "cccccccc-0000-4000-8000-000000000001", name: "Ortica Bike", code: "ORT" };
const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  createCaseStudy.mockReset();
});
afterEach(cleanup);

const avanti = () => screen.getByRole("button", { name: "Avanti", hidden: true });

describe("NewCaseDialog", () => {
  it("creates the draft with the client only (title Nome progetto, no business line) and opens Materiale", async () => {
    createCaseStudy.mockResolvedValue({ ok: true, value: { id: CASE_ID } });
    render(<NewCaseDialog clients={[ORTICA]} initialClientId={ORTICA.id} year={2026} />);
    await act(async () => fireEvent.click(avanti()));
    expect(createCaseStudy).toHaveBeenCalledExactlyOnceWith({ name: "Nome progetto", clientId: ORTICA.id, year: 2026 });
    expect(replace).toHaveBeenCalledExactlyOnceWith(`/case-studies/new?caseId=${CASE_ID}&step=1`);
  });

  it("asks for the client before creating anything", async () => {
    render(<NewCaseDialog clients={[ORTICA]} year={2026} />);
    await act(async () => fireEvent.click(avanti()));
    expect(createCaseStudy).not.toHaveBeenCalled();
    expect(screen.getByText("Scegli per quale cliente è.")).toBeTruthy();
  });

  it("says so when the create fails, and stays", async () => {
    createCaseStudy.mockResolvedValue({ ok: false, error: { code: "CLIENT_NOT_FOUND", message: "m" } });
    render(<NewCaseDialog clients={[ORTICA]} initialClientId={ORTICA.id} year={2026} />);
    await act(async () => fireEvent.click(avanti()));
    expect(screen.getByText("Questo cliente non c’è più. Ricarica la pagina e sceglilo di nuovo.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("Annulla goes back to Case history", () => {
    render(<NewCaseDialog clients={[ORTICA]} year={2026} />);
    fireEvent.click(screen.getByRole("button", { name: "Annulla", hidden: true }));
    expect(push).toHaveBeenCalledExactlyOnceWith("/case-studies");
  });
});
