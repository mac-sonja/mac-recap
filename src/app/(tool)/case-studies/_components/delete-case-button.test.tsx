// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import { it as dict, fill } from "@/shared/i18n/it";

const push = vi.fn();
const refresh = vi.fn();
const deleteCaseStudy = vi.fn<(input: unknown) => Promise<ActionResult<void>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/app/(tool)/case-studies/actions", () => ({ deleteCaseStudy: (input: unknown) => deleteCaseStudy(input) }));

const { DeleteCaseButton, isDeleteWord } = await import("./delete-case-button");

const CASE_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const NAME = "Rebrand";
const copy = dict.caseStudies.delete;

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  deleteCaseStudy.mockReset();
  deleteCaseStudy.mockResolvedValue({ ok: true, value: undefined });
});
afterEach(cleanup);

const open = async (variant: "row" | "bar" = "row") => {
  const user = userEvent.setup();
  render(<DeleteCaseButton caseId={CASE_ID} name={NAME} variant={variant} />);
  await user.click(screen.getByRole("button", { name: variant === "bar" ? copy.barButton : fill(copy.button, { name: NAME }) }));
  const dialog = await screen.findByRole("dialog", { name: variant === "bar" ? copy.titleOpen : fill(copy.title, { name: NAME }) });
  return { user, dialog, input: screen.getByLabelText(copy.confirmLabel), confirm: screen.getByRole("button", { name: copy.confirm }) };
};

/** Opens the dialog and types the confirmation word. */
const ready = async (variant: "row" | "bar" = "row") => {
  const opened = await open(variant);
  await opened.user.type(opened.input, "elimina");
  return opened;
};

describe("isDeleteWord", () => {
  it.each(["elimina", "Elimina", " ELIMINA  "])("accepts %j", (typed) => expect(isDeleteWord(typed)).toBe(true));
  it.each(["", "elimin", "elimina!", "e limina", "cancella"])("refuses %j", (typed) => expect(isDeleteWord(typed)).toBe(false));
});

describe("DeleteCaseButton", () => {
  it("opens a dialog naming the draft and saying it can't be undone; Annulla closes it without deleting", async () => {
    const { user, dialog } = await open();
    expect(dialog.textContent).toContain(copy.description);
    await user.click(screen.getByRole("button", { name: copy.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteCaseStudy).not.toHaveBeenCalled();
  });

  it("keeps Elimina inactive, with its reason, until elimina is typed, and never calls the action before", async () => {
    const { user, input, confirm } = await open();
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(copy.confirmReason)).toBeTruthy();
    await user.type(input, "elimin");
    await user.click(confirm);
    await user.type(input, "{Enter}");
    expect(deleteCaseStudy).not.toHaveBeenCalled();
    await user.type(input, "A");
    expect(confirm.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByText(copy.confirmReason)).toBeNull();
  });

  it("deletes on Enter once the word is typed", async () => {
    const { user, input } = await ready();
    await user.type(input, "{Enter}");
    expect(deleteCaseStudy).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID });
  });

  it("row: deletes the case on Elimina, closes the dialog and reloads the list", async () => {
    const { user, confirm } = await ready();
    await user.click(confirm);
    expect(deleteCaseStudy).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
  });

  it("bar: shows Elimina bozza and, after the delete, goes to the Case list", async () => {
    const { user, confirm, dialog } = await ready("bar");
    expect(dialog.textContent).toContain(copy.description);
    await user.click(confirm);
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/case-studies"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("treats a case already gone (NOT_FOUND) as deleted", async () => {
    deleteCaseStudy.mockResolvedValue({ ok: false, status: 404, error: { code: "NOT_FOUND", message: "m" } });
    const { user, confirm } = await ready();
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says so and reloads the page when the case is no longer a draft", async () => {
    deleteCaseStudy.mockResolvedValue({ ok: false, status: 409, error: { code: "CASE_NOT_DELETABLE", message: "m" } });
    const { user, confirm } = await ready("bar");
    await user.click(confirm);
    expect((await screen.findByRole("alert")).textContent).toBe(copy.notDraft);
    expect(refresh).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    ["a failed write", () => deleteCaseStudy.mockResolvedValue({ ok: false, status: 500, error: { code: "CASE_STUDY_WRITE_FAILED", message: "m" } })],
    ["a thrown call", () => deleteCaseStudy.mockRejectedValue(new Error("network"))],
  ])("shows a retry message for %s and keeps the dialog open", async (_label, arrange) => {
    arrange();
    const { user, confirm } = await ready();
    await user.click(confirm);
    expect((await screen.findByRole("alert")).textContent).toBe(copy.failed);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
