// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { BusinessLine, CaseStudy, ClientRef } from "@/modules/case-study";
import type { DetailsFieldSaved, DetailsForm } from "@/modules/material";

const push = vi.fn();
const refresh = vi.fn();
const createCaseStudy = vi.fn<(input: unknown) => Promise<ActionResult<CaseStudy>>>();
const updateCaseStudyDetails = vi.fn<(input: unknown) => Promise<ActionResult<CaseStudy>>>();
const saveDetailsField = vi.fn<(input: unknown) => Promise<ActionResult<DetailsFieldSaved>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }) }));
vi.mock("@/app/(tool)/case-studies/actions", () => ({
  createCaseStudy: (input: unknown) => createCaseStudy(input),
  updateCaseStudyDetails: (input: unknown) => updateCaseStudyDetails(input),
  saveDetailsField: (input: unknown) => saveDetailsField(input),
}));

const { CaseDetailsStep } = await import("./case-details-step");
const { DEBOUNCE_MS } = await import("./use-autosave-fields");

const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const LUMEN: ClientRef = { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" };
const TORINO: ClientRef = { id: "cccccccc-0000-4000-8000-000000000002", name: "Città di Torino", code: "CIT" };
const CLIENTS: ClientRef[] = [TORINO, LUMEN];
const BUSINESS_LINES: BusinessLine[] = ["branding", "social_media", "video", "web_design", "advertising", "eventi"];
const EMPTY: DetailsForm = { context: "", solution: "", results: "" };
const STEP_1 = `/case-studies/new?caseId=${ID}&step=1`;
const STEP_2 = `/case-studies/new?caseId=${ID}&step=2`;

const created = (over: Partial<CaseStudy> = {}): CaseStudy => ({
  id: ID,
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand",
  client: LUMEN,
  year: 2026,
  locale: "it",
  businessLine: "branding",
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

const EXISTING = { id: ID, code: "LUM-2026-01", name: "Rebrand", year: 2026, locale: "it" as "it" | "en", businessLine: "branding" as BusinessLine | null, client: LUMEN };

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

function renderNew(props: { clients?: ClientRef[]; initialClientId?: string } = {}) {
  return render(
    <CaseDetailsStep
      caseStudy={null}
      clients={props.clients ?? CLIENTS}
      initialClientId={props.initialClientId}
      defaultYear={2026}
      yearMin={1900}
      yearMax={2100}
      businessLines={BUSINESS_LINES}
      initialDetails={EMPTY}
      maxChars={5000}
    />,
  );
}

function renderExisting(over: Partial<typeof EXISTING> = {}, initial: DetailsForm = EMPTY, maxChars = 5000) {
  return render(
    <CaseDetailsStep
      caseStudy={{ ...EXISTING, ...over }}
      clients={[]}
      defaultYear={2026}
      yearMin={1900}
      yearMax={2100}
      businessLines={BUSINESS_LINES}
      initialDetails={initial}
      maxChars={maxChars}
    />,
  );
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const textarea = (label: "Contesto" | "Soluzione" | "Risultati") => screen.getByLabelText(label) as HTMLTextAreaElement;
const type = (label: "Contesto" | "Soluzione" | "Risultati", text: string) => fireEvent.change(textarea(label), { target: { value: text } });
const avanti = () => screen.getByRole("button", { name: "Avanti" });
const pill = (label: string) => screen.getByRole("radio", { name: label });
const flush = () => act(async () => {});
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const describedText = (el: Element) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent;

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field("Nome della case history"), "  Rebrand  ");
  await user.selectOptions(field("Cliente"), LUMEN.id);
  await user.click(pill("Social media"));
}

let replaceState: ReturnType<typeof vi.spyOn>;

const CONFIRM = "Le informazioni inserite non sono ancora salvate. Uscire comunque?";
const confirm = vi.fn<(message?: string) => boolean>();
const originalConfirm = window.confirm;

/** Clicks a same-origin link as a user would; true when the click went through. */
function clickLink(name: string) {
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  act(() => {
    screen.getByRole("link", { name }).dispatchEvent(click);
  });
  return !click.defaultPrevented;
}

function renderWithLink(step: ReactNode) {
  return render(
    <>
      <a href="/case-studies">Indietro</a>
      {step}
    </>,
  );
}

const newStep = () => (
  <CaseDetailsStep
    caseStudy={null}
    clients={CLIENTS}
    defaultYear={2026}
    yearMin={1900}
    yearMax={2100}
    businessLines={BUSINESS_LINES}
    initialDetails={EMPTY}
    maxChars={5000}
  />
);

const existingStep = (over: Partial<typeof EXISTING> = {}) => (
  <CaseDetailsStep
    caseStudy={{ ...EXISTING, ...over }}
    clients={[]}
    defaultYear={2026}
    yearMin={1900}
    yearMax={2100}
    businessLines={BUSINESS_LINES}
    initialDetails={EMPTY}
    maxChars={5000}
  />
);

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  confirm.mockReset();
  confirm.mockReturnValue(false);
  window.confirm = confirm;
  createCaseStudy.mockReset();
  updateCaseStudyDetails.mockReset();
  saveDetailsField.mockReset();
  saveDetailsField.mockImplementation(okSave);
  replaceState = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  replaceState.mockRestore();
  window.confirm = originalConfirm;
});

describe("CaseDetailsStep, a new case", () => {
  it("shows the fields in order: name, client, year (prefilled), language (Italiano), business line, then the three texts", () => {
    renderNew();
    expect(field("Nome della case history")).toHaveProperty("required", true);
    expect(field("Cliente").tagName).toBe("SELECT");
    expect(field("Anno")).toHaveProperty("value", "2026");
    const locale = field("Lingua del testo") as unknown as HTMLSelectElement;
    expect(locale.value).toBe("it");
    expect([...locale.options].map((o) => o.textContent)).toEqual(["Italiano", "English"]);
    const group = screen.getByRole("radiogroup", { name: "Business line" });
    expect(screen.getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual(
      ["Branding", "Social media", "Video", "Web design", "Advertising", "Eventi"].map((label) => [label, "false"]),
    );
    expect(screen.getAllByRole("textbox").map((t) => t.getAttribute("name"))).toEqual(["name", "context", "solution", "results"]);
    const order = [field("Nome della case history"), field("Cliente"), field("Anno"), locale, group, textarea("Contesto")];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(textarea("Contesto").placeholder).toBe("Di cosa aveva bisogno il cliente, e perché?");
  });

  it("keeps Avanti inactive until name, client, year and business line are set, with the reason linked", async () => {
    const user = userEvent.setup();
    renderNew();
    expect(avanti().getAttribute("aria-disabled")).toBe("true");
    expect(describedText(avanti())).toBe("Per continuare compila: Nome della case history, Cliente, Business line.");
    await user.type(field("Nome della case history"), "Rebrand");
    await user.selectOptions(field("Cliente"), LUMEN.id);
    expect(describedText(avanti())).toBe("Per continuare compila: Business line.");
    await user.clear(field("Anno"));
    expect(describedText(avanti())).toBe("Per continuare compila: Anno, Business line.");
    await user.type(field("Anno"), "2025");
    await user.click(pill("Video"));
    expect(avanti().getAttribute("aria-disabled")).toBe("false");
    expect(avanti().hasAttribute("aria-describedby")).toBe(false);
  });

  it("creates the case with trimmed values and the business line, names it in the URL, saves the texts, then opens step 2", async () => {
    createCaseStudy.mockResolvedValue({ ok: true, value: created({ businessLine: "social_media" }) });
    const user = userEvent.setup();
    renderNew();
    await fillRequired(user);
    await user.selectOptions(field("Lingua del testo"), "en");
    fireEvent.change(textarea("Contesto"), { target: { value: "Tre marchi" } });
    // No case yet: nothing autosaves.
    fireEvent.blur(textarea("Contesto"));
    expect(saveDetailsField).not.toHaveBeenCalled();
    await user.click(avanti());
    expect(createCaseStudy).toHaveBeenCalledExactlyOnceWith({
      name: "Rebrand",
      clientId: LUMEN.id,
      year: 2026,
      locale: "en",
      businessLine: "social_media",
    });
    expect(replaceState).toHaveBeenCalledWith(null, "", STEP_1);
    expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: ID, field: "context", text: "Tre marchi" });
    expect(push).toHaveBeenCalledExactlyOnceWith(STEP_2);
    expect(updateCaseStudyDetails).not.toHaveBeenCalled();
    // Stays busy while the wizard moves on.
    expect(avanti().getAttribute("aria-busy")).toBe("true");
  });

  it("pressing the inactive Avanti sends nothing and names each missing field, focusing the first", async () => {
    const user = userEvent.setup();
    renderNew();
    await user.click(avanti());
    expect(createCaseStudy).not.toHaveBeenCalled();
    expect(screen.getByText("Inserisci il nome della case history.")).toBeTruthy();
    expect(screen.getByText("Scegli il cliente.")).toBeTruthy();
    expect(screen.getByText("Scegli la business line.")).toBeTruthy();
    expect(document.activeElement).toBe(field("Nome della case history"));
    expect(screen.getByRole("radiogroup").getAttribute("aria-invalid")).toBe("true");
  });

  it("with only the business line missing, sends nothing and focuses the first pill", async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(field("Nome della case history"), "Rebrand");
    await user.selectOptions(field("Cliente"), LUMEN.id);
    await user.click(avanti());
    expect(createCaseStudy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(pill("Branding"));
    expect(describedText(screen.getByRole("radiogroup"))).toBe("Scegli la business line.");
    await user.click(pill("Eventi"));
    expect(screen.queryByText("Scegli la business line.")).toBeNull();
  });

  it("lists the clients as given after a placeholder; a known initialClientId starts selected", () => {
    renderNew({ initialClientId: LUMEN.id });
    const select = field("Cliente") as unknown as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ["", "Scegli un cliente"],
      [TORINO.id, "Città di Torino (CIT)"],
      [LUMEN.id, "Lumen Srl (LUM)"],
    ]);
    expect(select.value).toBe(LUMEN.id);
  });

  it("ignores an initialClientId that is not in the list", () => {
    renderNew({ initialClientId: "cccccccc-0000-4000-8000-00000000ffff" });
    expect((field("Cliente") as unknown as HTMLSelectElement).value).toBe("");
  });

  it("with no clients shows the note instead of the field and keeps Avanti inactive, described by the note", async () => {
    const user = userEvent.setup();
    renderNew({ clients: [] });
    expect(screen.queryByRole("combobox", { name: "Cliente" })).toBeNull();
    expect(screen.getByRole("link", { name: "pagina Clienti" }).getAttribute("href")).toBe("/clients");
    await user.type(field("Nome della case history"), "Rebrand");
    await user.click(pill("Video"));
    expect(avanti().getAttribute("aria-disabled")).toBe("true");
    expect(describedText(avanti())).toBe("Nessun cliente. Aggiungilo nella pagina Clienti.");
    await user.click(avanti());
    expect(createCaseStudy).not.toHaveBeenCalled();
  });

  it("rejects a year outside the range on the field without a request", async () => {
    const user = userEvent.setup();
    renderNew();
    await fillRequired(user);
    await user.clear(field("Anno"));
    await user.type(field("Anno"), "1800");
    await user.click(avanti());
    expect(createCaseStudy).not.toHaveBeenCalled();
    expect(field("Anno").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Inserisci un anno tra 1900 e 2100.")).toBeTruthy();
  });

  it("shows CLIENT_NOT_FOUND on the client select, not the generic line", async () => {
    createCaseStudy.mockResolvedValue({ ok: false, status: 404, error: { code: "CLIENT_NOT_FOUND", message: "No client with this id." } });
    const user = userEvent.setup();
    renderNew();
    await fillRequired(user);
    await user.click(avanti());
    expect(describedText(field("Cliente"))).toBe("Questo cliente non è più disponibile. Ricarica la pagina e scegli di nuovo.");
    expect(document.activeElement).toBe(field("Cliente"));
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(push).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it.each([
    ["year", "Anno", "Inserisci un anno tra 1900 e 2100."],
    ["locale", "Lingua del testo", "Scegli la lingua del testo."],
    ["clientId", "Cliente", "Scegli il cliente."],
  ])("maps a server INVALID_INPUT on %s to its message", async (name, label, message) => {
    createCaseStudy.mockResolvedValue({ ok: false, status: 400, error: { code: "INVALID_INPUT", message: "x", fields: [name] } });
    const user = userEvent.setup();
    renderNew();
    await fillRequired(user);
    await user.click(avanti());
    expect(field(label).getAttribute("aria-invalid")).toBe("true");
    expect(describedText(field(label))).toBe(message);
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("maps a server INVALID_INPUT on businessLine (e.g. an unknown value) to the pills", async () => {
    createCaseStudy.mockResolvedValue({ ok: false, status: 400, error: { code: "INVALID_INPUT", message: "x", fields: ["businessLine"] } });
    const user = userEvent.setup();
    renderNew();
    await fillRequired(user);
    await user.click(avanti());
    expect(describedText(screen.getByRole("radiogroup"))).toBe("Scegli la business line.");
    expect(document.activeElement).toBe(pill("Social media"));
  });

  it.each([
    ["FORBIDDEN", { ok: false, status: 403, error: { code: "FORBIDDEN", message: "Not allowed." } }],
    ["500", { ok: false, status: 500, error: { code: "CASE_STUDY_WRITE_FAILED", message: "db down" } }],
    ["INVALID_INPUT on an unknown field", { ok: false, status: 400, error: { code: "INVALID_INPUT", message: "x", fields: ["status"] } }],
  ] satisfies Array<[string, ActionResult<CaseStudy>]>)("on %s keeps the form filled and shows the generic error line", async (_label, result) => {
    createCaseStudy.mockResolvedValue(result);
    const user = userEvent.setup();
    renderNew();
    await fillRequired(user);
    await user.click(avanti());
    expect(screen.getByRole("alert").textContent).toBe("Non è stato possibile creare la case history. I dati inseriti sono ancora qui: riprova.");
    expect(document.body.textContent).not.toMatch(/Not allowed|db down/);
    expect(field("Nome della case history")).toHaveProperty("value", "  Rebrand  ");
    expect(pill("Social media").getAttribute("aria-checked")).toBe("true");
    expect(avanti().getAttribute("aria-disabled")).toBe("false");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("shows the generic error when the action throws", async () => {
    createCaseStudy.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    renderNew();
    await fillRequired(user);
    await user.click(avanti());
    expect(screen.getByRole("alert").textContent).toContain("Non è stato possibile creare la case history.");
  });

  it("sends one request when Avanti is pressed twice: busy while pending", async () => {
    const pending = deferred<ActionResult<CaseStudy>>();
    createCaseStudy.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderNew();
    await fillRequired(user);
    await user.click(avanti());
    expect(avanti().getAttribute("aria-busy")).toBe("true");
    expect(avanti().getAttribute("aria-disabled")).toBe("true");
    await user.click(avanti());
    await user.keyboard("{Enter}");
    expect(createCaseStudy).toHaveBeenCalledOnce();
    await act(async () => pending.resolve({ ok: true, value: created() }));
    expect(push).toHaveBeenCalledOnce();
  });

  it("when a text save fails after the create, the case stays, the field shows its error, and a retry saves only the texts", async () => {
    createCaseStudy.mockResolvedValue({ ok: true, value: created({ businessLine: "social_media" }) });
    saveDetailsField.mockImplementationOnce(failSave);
    const user = userEvent.setup();
    renderNew();
    await fillRequired(user);
    fireEvent.change(textarea("Risultati"), { target: { value: "+30%" } });
    await user.click(avanti());
    expect(createCaseStudy).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(null, "", STEP_1);
    expect(push).not.toHaveBeenCalled();
    expect(describedText(textarea("Risultati"))).toBe("Non salvato. Riprova modificando il testo.");
    expect(document.activeElement).toBe(textarea("Risultati"));
    // The client is now fixed.
    expect(field("Cliente").tagName).toBe("INPUT");
    expect(field("Cliente").value).toBe("Lumen Srl (LUM)");

    await user.click(avanti());
    expect(createCaseStudy).toHaveBeenCalledOnce();
    expect(updateCaseStudyDetails).not.toHaveBeenCalled();
    expect(saveDetailsField).toHaveBeenCalledTimes(2);
    expect(saveDetailsField).toHaveBeenLastCalledWith({ caseId: ID, field: "results", text: "+30%" });
    expect(push).toHaveBeenCalledExactlyOnceWith(STEP_2);
  });
});

describe("CaseDetailsStep, leaving a new case before Avanti", () => {
  // Without a link handler happy-dom would navigate; the guard runs in the capture phase first.
  const stopNavigation = () => screen.getByRole("link", { name: "Indietro" }).addEventListener("click", (event) => event.preventDefault());

  it("lets a link through without asking while nothing is entered", () => {
    renderWithLink(newStep());
    stopNavigation();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    let reached = false;
    screen.getByRole("link", { name: "Indietro" }).addEventListener("click", () => (reached = true));
    screen.getByRole("link", { name: "Indietro" }).dispatchEvent(click);
    expect(reached).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    ["a name", () => fireEvent.change(field("Nome della case history"), { target: { value: "R" } })],
    ["a business line", () => fireEvent.click(pill("Video"))],
    ["a text", () => fireEvent.change(textarea("Contesto"), { target: { value: "c" } })],
  ])("with %s entered, a link asks first and stays when declined", (_label, enter) => {
    renderWithLink(newStep());
    enter();
    let reached = false;
    screen.getByRole("link", { name: "Indietro" }).addEventListener("click", (event) => {
      reached = true;
      event.preventDefault();
    });
    expect(clickLink("Indietro")).toBe(false);
    expect(confirm).toHaveBeenCalledExactlyOnceWith(CONFIRM);
    expect(reached).toBe(false);
    expect(createCaseStudy).not.toHaveBeenCalled();
  });

  it("follows the link when the confirm is accepted", () => {
    confirm.mockReturnValue(true);
    renderWithLink(newStep());
    fireEvent.change(field("Nome della case history"), { target: { value: "R" } });
    let reached = false;
    screen.getByRole("link", { name: "Indietro" }).addEventListener("click", (event) => {
      reached = true;
      event.preventDefault();
    });
    screen.getByRole("link", { name: "Indietro" }).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(reached).toBe(true);
  });

  it("asks the browser to confirm a reload once something is entered, not before", () => {
    renderNew();
    const before = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);
    fireEvent.change(textarea("Risultati"), { target: { value: "r" } });
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);
  });

  it("stops asking once the case exists", async () => {
    createCaseStudy.mockResolvedValue({ ok: true, value: created() });
    const user = userEvent.setup();
    renderNew();
    await fillRequired(user);
    await user.click(avanti());
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });
});

describe("CaseDetailsStep, an existing draft", () => {
  it("prefills every field; the client is read-only with the reason it is fixed", () => {
    renderExisting({ name: "Rebrand Lumen", year: 2025, locale: "en", businessLine: "eventi" }, { context: "C", solution: "", results: "" });
    expect(field("Nome della case history").value).toBe("Rebrand Lumen");
    const client = field("Cliente");
    expect(client.tagName).toBe("INPUT");
    expect(client.readOnly).toBe(true);
    expect(client.value).toBe("Lumen Srl (LUM)");
    expect(describedText(client)).toBe("Il cliente non cambia dopo la creazione: il codice dipende da lui.");
    expect(field("Anno").value).toBe("2025");
    expect((field("Lingua del testo") as unknown as HTMLSelectElement).value).toBe("en");
    expect(pill("Eventi").getAttribute("aria-checked")).toBe("true");
    expect(pill("Eventi").tabIndex).toBe(0);
    expect(pill("Branding").tabIndex).toBe(-1);
    expect(textarea("Contesto").value).toBe("C");
    expect(screen.getByText("1 di 3 compilati")).toBeTruthy();
  });

  it("Avanti with nothing changed saves nothing and goes to step 2", async () => {
    renderExisting();
    fireEvent.click(avanti());
    await flush();
    expect(updateCaseStudyDetails).not.toHaveBeenCalled();
    expect(saveDetailsField).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledExactlyOnceWith(STEP_2);
  });

  it("Avanti saves changed name, year, language and business line (never the client), then goes to step 2", async () => {
    updateCaseStudyDetails.mockResolvedValue({ ok: true, value: created() });
    const user = userEvent.setup();
    renderExisting();
    await user.clear(field("Nome della case history"));
    await user.type(field("Nome della case history"), " Rebrand 2 ");
    await user.clear(field("Anno"));
    await user.type(field("Anno"), "2024");
    await user.selectOptions(field("Lingua del testo"), "en");
    await user.click(pill("Web design"));
    await user.click(avanti());
    expect(updateCaseStudyDetails).toHaveBeenCalledExactlyOnceWith({
      caseId: ID,
      name: "Rebrand 2",
      year: 2024,
      locale: "en",
      businessLine: "web_design",
    });
    expect(createCaseStudy).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledExactlyOnceWith(STEP_2);
  });

  it("a legacy draft without a business line keeps Avanti inactive until one is picked", async () => {
    updateCaseStudyDetails.mockResolvedValue({ ok: true, value: created() });
    const user = userEvent.setup();
    renderExisting({ businessLine: null });
    expect(screen.getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    expect(avanti().getAttribute("aria-disabled")).toBe("true");
    expect(describedText(avanti())).toBe("Per continuare compila: Business line.");
    await user.click(avanti());
    expect(updateCaseStudyDetails).not.toHaveBeenCalled();
    await user.click(pill("Branding"));
    await user.click(avanti());
    expect(updateCaseStudyDetails).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ caseId: ID, businessLine: "branding" }));
    expect(push).toHaveBeenCalledExactlyOnceWith(STEP_2);
  });

  it.each([
    ["STALE_STATUS", 409, "Questa case history non è più una bozza. Torna alle case history."],
    ["NOT_FOUND", 404, "Questa case history non è più una bozza. Torna alle case history."],
    ["CASE_STUDY_WRITE_FAILED", 500, "Non è stato possibile salvare i dettagli. I dati inseriti sono ancora qui: riprova."],
  ])("on %s stays on the step with its line", async (code, status, line) => {
    updateCaseStudyDetails.mockResolvedValue({ ok: false, status, error: { code, message: "m" } });
    const user = userEvent.setup();
    renderExisting();
    await user.click(pill("Video"));
    await user.click(avanti());
    expect(screen.getByRole("alert").textContent).toBe(line);
    expect(push).not.toHaveBeenCalled();
    expect(pill("Video").getAttribute("aria-checked")).toBe("true");
  });

  it("a link clicked with an unsaved business line saves it first, then follows", async () => {
    const pending = deferred<ActionResult<CaseStudy>>();
    updateCaseStudyDetails.mockReturnValue(pending.promise);
    render(
      <>
        <a href="/case-studies">Indietro</a>
        <CaseDetailsStep
          caseStudy={EXISTING}
          clients={[]}
          defaultYear={2026}
          yearMin={1900}
          yearMax={2100}
          businessLines={BUSINESS_LINES}
          initialDetails={EMPTY}
          maxChars={5000}
        />
      </>,
    );
    fireEvent.click(pill("Video"));
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      screen.getByRole("link", { name: "Indietro" }).dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(true);
    await flush();
    expect(updateCaseStudyDetails).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ businessLine: "video" }));
    expect(push).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ ok: true, value: created({ businessLine: "video" }) }));
    await flush();
    expect(push).toHaveBeenCalledExactlyOnceWith("/case-studies");
  });

  it.each([
    ["STALE_STATUS", 409, "Questa case history non è più una bozza. Torna alle case history."],
    ["CASE_STUDY_WRITE_FAILED", 500, "Non è stato possibile salvare i dettagli. I dati inseriti sono ancora qui: riprova."],
  ])("a link whose details save fails with %s stays, without navigating, and shows the alert", async (code, status, line) => {
    updateCaseStudyDetails.mockResolvedValue({ ok: false, status, error: { code, message: "m" } });
    renderWithLink(existingStep());
    fireEvent.click(pill("Video"));
    expect(clickLink("Indietro")).toBe(false);
    await flush();
    expect(updateCaseStudyDetails).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(line);
  });

  describe("a link with info edits that can't be saved (legacy draft without a business line)", () => {
    it("asks, and stays without saving when declined", async () => {
      renderWithLink(existingStep({ businessLine: null }));
      fireEvent.change(field("Nome della case history"), { target: { value: "Nuovo nome" } });
      expect(clickLink("Indietro")).toBe(false);
      await flush();
      expect(confirm).toHaveBeenCalledExactlyOnceWith(CONFIRM);
      expect(updateCaseStudyDetails).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    });

    it("when confirmed, leaves without the info edits but still flushes the texts", async () => {
      confirm.mockReturnValue(true);
      renderWithLink(existingStep({ businessLine: null }));
      fireEvent.change(field("Nome della case history"), { target: { value: "Nuovo nome" } });
      fireEvent.change(textarea("Contesto"), { target: { value: "c" } });
      expect(clickLink("Indietro")).toBe(false);
      await flush();
      expect(updateCaseStudyDetails).not.toHaveBeenCalled();
      expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: ID, field: "context", text: "c" });
      expect(push).toHaveBeenCalledExactlyOnceWith("/case-studies");
    });

    it("does not ask when the edits can be saved", async () => {
      updateCaseStudyDetails.mockResolvedValue({ ok: true, value: created() });
      renderWithLink(existingStep({ businessLine: null }));
      fireEvent.click(pill("Video"));
      expect(clickLink("Indietro")).toBe(false);
      await flush();
      expect(confirm).not.toHaveBeenCalled();
      expect(updateCaseStudyDetails).toHaveBeenCalledOnce();
      expect(push).toHaveBeenCalledExactlyOnceWith("/case-studies");
    });
  });

  it("a year change that renumbers the draft reloads the page data when the step stays (a text failed)", async () => {
    updateCaseStudyDetails.mockResolvedValue({ ok: true, value: created({ year: 2025, code: "LUM-2025-02", number: 2 }) });
    saveDetailsField.mockImplementation(failSave);
    const user = userEvent.setup();
    renderExisting();
    await user.clear(field("Anno"));
    await user.type(field("Anno"), "2025");
    fireEvent.change(textarea("Contesto"), { target: { value: "c" } });
    await user.click(avanti());
    expect(updateCaseStudyDetails).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ year: 2025 }));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("a year change that leaves the step goes on to step 2, which loads the new code", async () => {
    updateCaseStudyDetails.mockResolvedValue({ ok: true, value: created({ year: 2025, code: "LUM-2025-02", number: 2 }) });
    const user = userEvent.setup();
    renderExisting();
    await user.clear(field("Anno"));
    await user.type(field("Anno"), "2025");
    await user.click(avanti());
    expect(push).toHaveBeenCalledExactlyOnceWith(STEP_2);
    expect(refresh).not.toHaveBeenCalled();
  });

  describe("the three texts autosave", () => {
    beforeEach(() => vi.useFakeTimers());

    it("saves once after a pause and updates the counter", async () => {
      renderExisting();
      type("Soluzione", "Un solo logotipo");
      expect(screen.getByText("1 di 3 compilati")).toBeTruthy();
      await wait(DEBOUNCE_MS - 1);
      type("Soluzione", "Un solo logotipo e due registri");
      await wait(DEBOUNCE_MS - 1);
      expect(saveDetailsField).not.toHaveBeenCalled();
      await wait(1);
      expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: ID, field: "solution", text: "Un solo logotipo e due registri" });
      await wait(DEBOUNCE_MS * 2);
      expect(saveDetailsField).toHaveBeenCalledTimes(1);
    });

    it("saves at once on blur, flushing the pending debounce", async () => {
      renderExisting();
      type("Contesto", "Tre marchi");
      fireEvent.blur(textarea("Contesto"));
      await flush();
      expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: ID, field: "context", text: "Tre marchi" });
      await wait(DEBOUNCE_MS * 2);
      expect(saveDetailsField).toHaveBeenCalledTimes(1);
    });

    it('saves a cleared field as "" and sends nothing for a blur without a change', async () => {
      renderExisting({}, { context: "Testo", solution: "", results: "" });
      fireEvent.blur(textarea("Soluzione"));
      type("Contesto", "");
      fireEvent.blur(textarea("Contesto"));
      await flush();
      expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: ID, field: "context", text: "" });
      expect(screen.getByText("0 di 3 compilati")).toBeTruthy();
    });

    it("never runs two saves for a field at once; text typed meanwhile is saved after", async () => {
      const first = deferred<ActionResult<DetailsFieldSaved>>();
      saveDetailsField.mockImplementationOnce(() => first.promise);
      renderExisting();
      type("Contesto", "uno");
      fireEvent.blur(textarea("Contesto"));
      await flush();
      type("Contesto", "uno due");
      fireEvent.blur(textarea("Contesto"));
      type("Contesto", "uno due tre");
      await wait(DEBOUNCE_MS);
      expect(saveDetailsField).toHaveBeenCalledTimes(1);
      await act(async () => first.resolve({ ok: true, value: { field: "context", text: "uno" } }));
      await flush();
      expect(saveDetailsField).toHaveBeenCalledTimes(2);
      expect(saveDetailsField).toHaveBeenLastCalledWith({ caseId: ID, field: "context", text: "uno due tre" });
    });

    it.each([
      ["an error result", failSave],
      ["a throw", async () => Promise.reject(new Error("network"))],
    ])("keeps the text after %s, shows and announces the error, and retries on the next edit", async (_label, failure) => {
      saveDetailsField.mockImplementationOnce(failure);
      renderExisting();
      type("Risultati", "+30% vendite");
      fireEvent.blur(textarea("Risultati"));
      await flush();
      expect(textarea("Risultati").value).toBe("+30% vendite");
      expect(describedText(textarea("Risultati"))).toBe("Non salvato. Riprova modificando il testo.");
      expect(textarea("Risultati").getAttribute("aria-invalid")).toBe("true");
      const status = screen.getByRole("status");
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.textContent).toBe("Risultati: Non salvato. Riprova modificando il testo.");
      type("Risultati", "+30% vendite in un anno");
      await wait(DEBOUNCE_MS);
      expect(saveDetailsField).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("Non salvato. Riprova modificando il testo.")).toBeNull();
    });

    it("counts the limit in code points: at the limit it saves; over it nothing is sent and Avanti focuses the field", async () => {
      renderExisting({}, EMPTY, 5);
      type("Contesto", "😀".repeat(5));
      expect(screen.getByText("Massimo 5 caratteri.")).toBeTruthy();
      fireEvent.blur(textarea("Contesto"));
      await flush();
      expect(saveDetailsField).toHaveBeenCalledTimes(1);
      type("Soluzione", "123456");
      expect(textarea("Soluzione").getAttribute("aria-invalid")).toBe("true");
      fireEvent.blur(textarea("Soluzione"));
      fireEvent.click(avanti());
      await flush();
      expect(saveDetailsField).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(textarea("Soluzione"));
    });

    it("Avanti flushes pending saves before leaving, and stays when one fails", async () => {
      const pending = deferred<ActionResult<DetailsFieldSaved>>();
      saveDetailsField.mockImplementationOnce(() => pending.promise);
      renderExisting();
      type("Contesto", "c");
      fireEvent.click(avanti());
      await flush();
      expect(push).not.toHaveBeenCalled();
      await act(async () => pending.resolve({ ok: true, value: { field: "context", text: "c" } }));
      await flush();
      expect(push).toHaveBeenCalledExactlyOnceWith(STEP_2);
    });

    it("a stepper link clicked with unsaved text waits for the save, then navigates", async () => {
      const pending = deferred<ActionResult<DetailsFieldSaved>>();
      saveDetailsField.mockImplementationOnce(() => pending.promise);
      render(
        <>
          <a href={`/case-studies/new?caseId=${ID}&step=2`}>Materiale</a>
          <CaseDetailsStep
            caseStudy={EXISTING}
            clients={[]}
            defaultYear={2026}
            yearMin={1900}
            yearMax={2100}
            businessLines={BUSINESS_LINES}
            initialDetails={EMPTY}
            maxChars={5000}
          />
        </>,
      );
      type("Contesto", "c");
      const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      act(() => {
        screen.getByRole("link", { name: "Materiale" }).dispatchEvent(click);
      });
      expect(click.defaultPrevented).toBe(true);
      await flush();
      expect(push).not.toHaveBeenCalled();
      await act(async () => pending.resolve({ ok: true, value: { field: "context", text: "c" } }));
      await flush();
      expect(push).toHaveBeenCalledExactlyOnceWith(STEP_2);
      expect(updateCaseStudyDetails).not.toHaveBeenCalled();
    });

    it("leaves link clicks alone when everything is saved", async () => {
      render(
        <>
          <a href="/case-studies">Indietro</a>
          <CaseDetailsStep
            caseStudy={EXISTING}
            clients={[]}
            defaultYear={2026}
            yearMin={1900}
            yearMax={2100}
            businessLines={BUSINESS_LINES}
            initialDetails={EMPTY}
            maxChars={5000}
          />
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
    });

    it("saves a pending edit when the step unmounts, and on beforeunload", async () => {
      const { unmount } = renderExisting();
      type("Contesto", "c");
      window.dispatchEvent(new Event("beforeunload"));
      await flush();
      expect(saveDetailsField).toHaveBeenCalledExactlyOnceWith({ caseId: ID, field: "context", text: "c" });
      type("Risultati", "r");
      unmount();
      await flush();
      expect(saveDetailsField).toHaveBeenLastCalledWith({ caseId: ID, field: "results", text: "r" });
    });
  });
});
