// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { CaseStudy, ClientRef } from "@/modules/case-study";

const replace = vi.fn();
const createCaseStudy = vi.fn<(input: unknown) => Promise<ActionResult<CaseStudy>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/app/(tool)/case-studies/actions", () => ({ createCaseStudy: (input: unknown) => createCaseStudy(input) }));

const { NameStep } = await import("./name-step");

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

const created = (over: Partial<CaseStudy> = {}): CaseStudy => ({
  id: ID,
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand",
  client: { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" },
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

const LUMEN: ClientRef = { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" };
const TORINO: ClientRef = { id: "cccccccc-0000-4000-8000-000000000002", name: "Città di Torino", code: "CIT" };
const CLIENTS: ClientRef[] = [TORINO, LUMEN];

const field = (name: string) => screen.getByLabelText(name);
const avanti = () => screen.getByRole("button", { name: "Avanti" });

function setup(clients: ClientRef[] = CLIENTS) {
  const user = userEvent.setup();
  render(<NameStep clients={clients} defaultYear={2026} yearMin={1900} yearMax={2100} />);
  return user;
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field("Nome della case history"), "  Rebrand  ");
  await user.selectOptions(field("Cliente"), LUMEN.id);
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
    expect(field("Cliente").tagName).toBe("SELECT");
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
    expect(createCaseStudy).toHaveBeenCalledExactlyOnceWith({ name: "Rebrand", clientId: LUMEN.id, year: 2024, locale: "en" });
    expect(replace).toHaveBeenCalledExactlyOnceWith(`/case-studies/new?caseId=${ID}`);
    // Stays busy while the wizard moves on to step 1.
    expect(avanti().getAttribute("aria-busy")).toBe("true");
  });

  it("lists the clients as given, '{name} ({code})', after a placeholder first option; no free text", () => {
    setup();
    const select = field("Cliente") as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ["", "Scegli un cliente"],
      [TORINO.id, "Città di Torino (CIT)"],
      [LUMEN.id, "Lumen Srl (LUM)"],
    ]);
    expect(select.value).toBe("");
    expect(screen.queryByRole("textbox", { name: "Cliente" })).toBeNull();
  });

  it("with no clients shows the note instead of the field, keeps Avanti inactive and sends nothing", async () => {
    const user = setup([]);
    const note = screen.getByText((_content, el) => el?.tagName === "P" && el.textContent === "Nessun cliente. Aggiungilo nella pagina Clienti.");
    expect(screen.queryByRole("combobox", { name: "Cliente" })).toBeNull();
    // "pagina Clienti" links to the Clients page, where clients are added.
    expect(screen.getByRole("link", { name: "pagina Clienti" }).getAttribute("href")).toBe("/clients");
    await user.type(field("Nome della case history"), "Rebrand");
    expect(avanti().getAttribute("aria-disabled")).toBe("true");
    // The inactive Avanti names its reason: the note.
    expect(note.id).not.toBe("");
    expect(avanti().getAttribute("aria-describedby")).toBe(note.id);
    expect(document.getElementById(avanti().getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Nessun cliente. Aggiungilo nella pagina Clienti.",
    );
    await user.click(avanti());
    expect(createCaseStudy).not.toHaveBeenCalled();
    // The note stays the explanation after the press.
    expect(avanti().getAttribute("aria-describedby")).toBe(note.id);
  });

  it("preselects initialClientId and creates the case for it", async () => {
    const user = userEvent.setup();
    render(<NameStep clients={CLIENTS} initialClientId={LUMEN.id} defaultYear={2026} yearMin={1900} yearMax={2100} />);
    expect((field("Cliente") as HTMLSelectElement).value).toBe(LUMEN.id);
    createCaseStudy.mockResolvedValue({ ok: true, value: created() });
    await user.type(field("Nome della case history"), "Rebrand");
    await user.click(avanti());
    expect(createCaseStudy).toHaveBeenCalledWith({ name: "Rebrand", clientId: LUMEN.id, year: 2026, locale: "it" });
  });

  it("ignores an initialClientId that is not in the list", () => {
    render(
      <NameStep
        clients={CLIENTS}
        initialClientId="cccccccc-0000-4000-8000-00000000ffff"
        defaultYear={2026}
        yearMin={1900}
        yearMax={2100}
      />,
    );
    expect((field("Cliente") as HTMLSelectElement).value).toBe("");
  });

  it("does not describe Avanti by the note when there are clients", () => {
    setup();
    expect(avanti().hasAttribute("aria-describedby")).toBe(false);
  });

  it.each([
    ["name", "Nome della case history", "Inserisci il nome della case history."],
    ["client", "Cliente", "Scegli il cliente."],
  ])("sends nothing when %s is missing and names it on that field", async (label, missing, message) => {
    const user = setup();
    if (label === "name") await user.selectOptions(field("Cliente"), LUMEN.id);
    else await user.type(field("Nome della case history"), "Rebrand");
    const filled = label === "name" ? "Cliente" : "Nome della case history";
    expect(avanti().getAttribute("aria-disabled")).toBe("true");
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

  it("treats a blank (spaces only) name and no picked client as missing and names both", async () => {
    const user = setup();
    await user.type(field("Nome della case history"), "   ");
    await user.keyboard("{Enter}");
    expect(createCaseStudy).not.toHaveBeenCalled();
    expect(screen.getByText("Inserisci il nome della case history.")).toBeTruthy();
    expect(screen.getByText("Scegli il cliente.")).toBeTruthy();
    expect(document.activeElement).toBe(field("Nome della case history"));
  });

  it("clears a field's message once it is edited", async () => {
    const user = setup();
    await user.click(avanti());
    expect(screen.queryByText("Inserisci il nome della case history.")).not.toBeNull();
    await user.type(field("Nome della case history"), "R");
    expect(screen.queryByText("Inserisci il nome della case history.")).toBeNull();
    expect(screen.queryByText("Scegli il cliente.")).not.toBeNull();
    await user.selectOptions(field("Cliente"), TORINO.id);
    expect(screen.queryByText("Scegli il cliente.")).toBeNull();
  });

  it("shows a CLIENT_NOT_FOUND refusal on the client select (reload), not the generic line", async () => {
    createCaseStudy.mockResolvedValue({
      ok: false,
      status: 404,
      error: { code: "CLIENT_NOT_FOUND", message: "No client with this id." },
    });
    const user = setup();
    await fillRequired(user);
    await user.click(avanti());
    const select = field("Cliente");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(select.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Questo cliente non è più disponibile. Ricarica la pagina e scegli di nuovo.",
    );
    expect(document.activeElement).toBe(select);
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(document.body.textContent).not.toContain("No client");
    expect(replace).not.toHaveBeenCalled();
    expect(avanti().getAttribute("aria-busy")).toBeNull();
  });

  it("maps a server INVALID_INPUT on clientId to the message on the select", async () => {
    createCaseStudy.mockResolvedValue({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "clientId: Invalid UUID.", fields: ["clientId"] },
    });
    const user = setup();
    await fillRequired(user);
    await user.click(avanti());
    const select = field("Cliente");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(select.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Scegli il cliente.");
    expect(screen.getByRole("alert").textContent).toBe("");
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
    expect(field("Cliente")).toHaveProperty("value", LUMEN.id);
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
