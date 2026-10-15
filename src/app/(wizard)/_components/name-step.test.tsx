// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/(tool)/case-studies/actions";
import type { CaseStudy } from "@/modules/case-study";

const replace = vi.fn();
const createCaseStudy = vi.fn<(input: unknown) => Promise<ActionResult<CaseStudy>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/app/(tool)/case-studies/actions", () => ({ createCaseStudy: (input: unknown) => createCaseStudy(input) }));

const { NameStep } = await import("./name-step");

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

const created = (over: Partial<CaseStudy> = {}): CaseStudy => ({
  id: ID,
  name: "Rebrand",
  client: "Acme",
  year: 2026,
  locale: "it",
  status: "draft",
  projectOrderRef: null,
  headRevisionId: null,
  approvedRevisionId: null,
  headVersion: 0,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-14T10:00:00+00:00",
  updatedAt: "2026-10-14T10:00:00+00:00",
  deletedAt: null,
  ...over,
});

const field = (name: string) => screen.getByLabelText(name);
const avanti = () => screen.getByRole("button", { name: "Avanti" });

function setup() {
  const user = userEvent.setup();
  render(<NameStep defaultYear={2026} yearMin={1900} yearMax={2100} />);
  return user;
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field("Nome della case history"), "  Rebrand  ");
  await user.type(field("Cliente"), "Acme");
}

beforeEach(() => {
  replace.mockReset();
  createCaseStudy.mockReset();
});

afterEach(cleanup);

describe("NameStep", () => {
  it("shows labelled fields: year prefilled and editable, Italiano by default", () => {
    setup();
    expect(field("Nome della case history")).toHaveProperty("required", true);
    expect(field("Cliente")).toHaveProperty("required", true);
    expect(field("Anno")).toHaveProperty("value", "2026");
    const locale = field("Lingua del testo") as HTMLSelectElement;
    expect(locale.value).toBe("it");
    expect([...locale.options].map((o) => o.textContent)).toEqual(["Italiano", "English"]);
    expect(avanti().getAttribute("aria-disabled")).toBe("true");
  });

  it("creates the case with trimmed values, then replaces the URL with ?caseId=", async () => {
    createCaseStudy.mockResolvedValue({ ok: true, value: created() });
    const user = setup();
    await fillRequired(user);
    await user.clear(field("Anno"));
    await user.type(field("Anno"), "2024");
    await user.selectOptions(field("Lingua del testo"), "en");
    expect(avanti().getAttribute("aria-disabled")).toBe("false");
    await user.click(avanti());
    expect(createCaseStudy).toHaveBeenCalledExactlyOnceWith({ name: "Rebrand", client: "Acme", year: 2024, locale: "en" });
    expect(replace).toHaveBeenCalledExactlyOnceWith(`/case-studies/new?caseId=${ID}`);
    // Stays busy while the wizard moves on to step 1.
    expect(avanti().getAttribute("aria-busy")).toBe("true");
  });

  it.each([
    ["name", "Cliente", "Acme", "Nome della case history", "Inserisci il nome della case history."],
    ["client", "Nome della case history", "Rebrand", "Cliente", "Inserisci il cliente."],
  ])("sends nothing when %s is empty and names it on that field", async (_label, filled, value, missing, message) => {
    const user = setup();
    await user.type(field(filled), value);
    await user.click(avanti());
    expect(createCaseStudy).not.toHaveBeenCalled();
    const input = field(missing);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(message);
    expect(document.activeElement).toBe(input);
    expect(field(filled).getAttribute("aria-invalid")).toBeNull();
  });

  it("treats blank (spaces only) name and client as missing and names both", async () => {
    const user = setup();
    await user.type(field("Nome della case history"), "   ");
    await user.type(field("Cliente"), "  ");
    await user.keyboard("{Enter}");
    expect(createCaseStudy).not.toHaveBeenCalled();
    expect(screen.getByText("Inserisci il nome della case history.")).toBeTruthy();
    expect(screen.getByText("Inserisci il cliente.")).toBeTruthy();
    expect(document.activeElement).toBe(field("Nome della case history"));
  });

  it("clears a field's message once it is edited", async () => {
    const user = setup();
    await user.click(avanti());
    expect(screen.queryByText("Inserisci il nome della case history.")).not.toBeNull();
    await user.type(field("Nome della case history"), "R");
    expect(screen.queryByText("Inserisci il nome della case history.")).toBeNull();
    expect(screen.queryByText("Inserisci il cliente.")).not.toBeNull();
  });

  it("rejects a year outside the range on the field without a request", async () => {
    const user = setup();
    await fillRequired(user);
    await user.clear(field("Anno"));
    await user.type(field("Anno"), "1800");
    await user.click(avanti());
    expect(createCaseStudy).not.toHaveBeenCalled();
    expect(field("Anno").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Inserisci un anno tra 1900 e 2100.")).toBeTruthy();
  });

  it("maps a server INVALID_INPUT on year to the Italian message on that field", async () => {
    createCaseStudy.mockResolvedValue({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "year: Too big.", fields: ["year"] },
    });
    const user = setup();
    await fillRequired(user);
    await user.click(avanti());
    expect(createCaseStudy).toHaveBeenCalledOnce();
    expect(field("Anno").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Inserisci un anno tra 1900 e 2100.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Too big");
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(replace).not.toHaveBeenCalled();
  });

  it("maps a server INVALID_INPUT on locale to the message on the select", async () => {
    createCaseStudy.mockResolvedValue({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "locale: Invalid option.", fields: ["locale"] },
    });
    const user = setup();
    await fillRequired(user);
    await user.click(avanti());
    const select = field("Lingua del testo");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(select.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Scegli la lingua del testo.",
    );
    expect(document.activeElement).toBe(select);
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("shows the field message and the generic line when INVALID_INPUT also names a field the form lacks", async () => {
    createCaseStudy.mockResolvedValue({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "x", fields: ["year", "status"] },
    });
    const user = setup();
    await fillRequired(user);
    await user.click(avanti());
    expect(field("Anno").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("Non è stato possibile creare la case history.");
  });

  it.each([
    ["FORBIDDEN", { ok: false, status: 403, error: { code: "FORBIDDEN", message: "Not allowed." } }],
    ["500", { ok: false, status: 500, error: { code: "CASE_STUDY_WRITE_FAILED", message: "db down" } }],
    ["INVALID_INPUT on an unknown field", { ok: false, status: 400, error: { code: "INVALID_INPUT", message: "x", fields: ["status"] } }],
  ] satisfies Array<[string, ActionResult<CaseStudy>]>)("on %s keeps the form filled and shows the generic error line", async (_label, result) => {
    createCaseStudy.mockResolvedValue(result);
    const user = setup();
    await fillRequired(user);
    await user.click(avanti());
    expect(screen.getByRole("alert").textContent).toBe(
      "Non è stato possibile creare la case history. I dati inseriti sono ancora qui: riprova.",
    );
    expect(document.body.textContent).not.toMatch(/Not allowed|db down/);
    expect(field("Nome della case history")).toHaveProperty("value", "  Rebrand  ");
    expect(field("Cliente")).toHaveProperty("value", "Acme");
    expect(avanti().getAttribute("aria-disabled")).toBe("false");
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the generic error when the action throws", async () => {
    createCaseStudy.mockRejectedValue(new Error("network"));
    const user = setup();
    await fillRequired(user);
    await user.click(avanti());
    expect(screen.getByRole("alert").textContent).toContain("Non è stato possibile creare la case history.");
  });

  it("sends one request when Avanti is pressed twice: busy while pending", async () => {
    let resolve: (value: ActionResult<CaseStudy>) => void = () => undefined;
    createCaseStudy.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = setup();
    await fillRequired(user);
    await user.click(avanti());
    expect(avanti().getAttribute("aria-busy")).toBe("true");
    expect(avanti().getAttribute("aria-disabled")).toBe("true");
    await user.click(avanti());
    await user.keyboard("{Enter}");
    expect(createCaseStudy).toHaveBeenCalledOnce();
    await act(async () => resolve({ ok: true, value: created() }));
    expect(replace).toHaveBeenCalledOnce();
  });
});
