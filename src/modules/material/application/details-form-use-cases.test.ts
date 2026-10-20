import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { emptyDetailsForm, FORM_FIELDS, type DetailsForm, type FormField } from "@/modules/material/domain/details-form";
import type { AssetRepository } from "@/modules/material/ports/asset-repository";
import type { DetailsFormRepository } from "@/modules/material/ports/details-form-repository";
import { err, ok } from "@/shared/result";
import type { CaseStudies, MaterialDeps } from "./deps";
import { makeGetDetailsForm } from "./get-details-form";
import { makeResolveRefs } from "./resolve-refs";
import { makeSaveDetailsField } from "./save-details-field";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_CASE_ID = "aaaaaaaa-0000-4000-8000-000000000002";
const DELETED_CASE_ID = "aaaaaaaa-0000-4000-8000-000000000003";

/**
 * In-memory world mirroring `save_context_field` / `context_form`: two live
 * cases (one soft-deleted), form rows by case, the recorded events and the case
 * status (which must never change).
 */
function world() {
  const rows = new Map<string, DetailsForm>();
  const writes: { caseId: string; field: FormField; text: string }[] = [];
  const live = new Set([CASE_ID, OTHER_CASE_ID]);
  const events: { caseId: string; type: string; data: unknown; actorId: string }[] = [];
  const status: Record<string, string> = { [CASE_ID]: "approved", [OTHER_CASE_ID]: "draft" };

  const form = {
    saveField: vi.fn<DetailsFormRepository["saveField"]>(async (caseId, field, text) => {
      if (!live.has(caseId)) return err({ code: "NOT_FOUND", message: "none" });
      if (!(FORM_FIELDS as readonly string[]).includes(field)) return err({ code: "UNKNOWN_FIELD", message: "none" });
      const row = rows.get(caseId);
      const previous = row?.[field] ?? "";
      if (previous === text) return ok(previous);
      rows.set(caseId, { ...(row ?? emptyDetailsForm()), [field]: text });
      writes.push({ caseId, field, text });
      return ok(previous);
    }),
    read: vi.fn<DetailsFormRepository["read"]>(async (caseId) => ok({ ...(rows.get(caseId) ?? emptyDetailsForm()) })),
  } satisfies DetailsFormRepository;

  const cases = {
    get: vi.fn<CaseStudies["get"]>(async (id) =>
      live.has(String(id)) ? ok({ id, status: status[String(id)] }) : err({ code: "NOT_FOUND", message: "No case study with this id." }),
    ),
    recordEvent: vi.fn<CaseStudies["recordEvent"]>(async (who, input) => {
      events.push({ ...input, actorId: who.id });
      return ok({});
    }),
  } satisfies CaseStudies;

  const unused = <T extends object>(name: string) =>
    new Proxy({} as T, {
      get: (_target, prop) => () => {
        throw new Error(`details use case called ${name}.${String(prop)}`);
      },
    });

  const deps: MaterialDeps = {
    assets: unused<AssetRepository>("assets"),
    renditions: unused<MaterialDeps["renditions"]>("renditions"),
    jobs: unused<MaterialDeps["jobs"]>("jobs"),
    form,
    storage: null,
    cases,
    newId: () => "unused",
  };
  return { deps, form, cases, rows, writes, events, status };
}

const codeOf = (result: { ok: boolean; error?: { code: string } }) => (result.ok ? "OK" : result.error?.code);
const save = (w: ReturnType<typeof world>, input: unknown) => makeSaveDetailsField(w.deps)(actor, input);
const read = (w: ReturnType<typeof world>, caseId = CASE_ID) => makeGetDetailsForm(w.deps)({ caseId });

describe("saveDetailsField", () => {
  it("first save: creates the row with that field, others ''; records details_saved { field } only; status unchanged", async () => {
    const w = world();
    const result = await save(w, { caseId: CASE_ID, field: "context", text: "Bando PNRR" });
    expect(result).toEqual(ok({ field: "context", text: "Bando PNRR" }));
    expect(w.rows.get(CASE_ID)).toEqual({ context: "Bando PNRR", solution: "", results: "" });
    expect(w.events).toEqual([{ caseId: CASE_ID, type: "details_saved", data: { field: "context" }, actorId: actor.id }]);
    expect(JSON.stringify(w.events)).not.toContain("Bando");
    expect(w.form.saveField).toHaveBeenCalledWith(CASE_ID, "context", "Bando PNRR", actor.id);
    expect(w.status[CASE_ID]).toBe("approved");
  });

  it("next save: sets results, leaves context untouched, records an event", async () => {
    const w = world();
    await save(w, { caseId: CASE_ID, field: "context", text: "Bando PNRR" });
    expect(codeOf(await save(w, { caseId: CASE_ID, field: "results", text: "+30% iscritti" }))).toBe("OK");
    expect(w.rows.get(CASE_ID)).toEqual({ context: "Bando PNRR", solution: "", results: "+30% iscritti" });
    expect(w.events.map((e) => e.data)).toEqual([{ field: "context" }, { field: "results" }]);
  });

  it("unchanged: saving the stored text again writes nothing and records no event", async () => {
    const w = world();
    await save(w, { caseId: CASE_ID, field: "solution", text: "App" });
    expect(await save(w, { caseId: CASE_ID, field: "solution", text: "App" })).toEqual(ok({ field: "solution", text: "App" }));
    expect(w.writes).toHaveLength(1);
    expect(w.events).toHaveLength(1);
  });

  it("a first save of '' on a case with no row changes nothing and records no event", async () => {
    const w = world();
    expect(codeOf(await save(w, { caseId: CASE_ID, field: "context", text: "" }))).toBe("OK");
    expect(w.rows.has(CASE_ID)).toBe(false);
    expect(w.events).toEqual([]);
  });

  it("clear: '' empties the field and records an event", async () => {
    const w = world();
    await save(w, { caseId: CASE_ID, field: "context", text: "Bando PNRR" });
    expect(await save(w, { caseId: CASE_ID, field: "context", text: "" })).toEqual(ok({ field: "context", text: "" }));
    expect(w.rows.get(CASE_ID)?.context).toBe("");
    expect(w.events).toHaveLength(2);
  });

  it("stores the text as given (no trimming)", async () => {
    const w = world();
    await save(w, { caseId: CASE_ID, field: "context", text: "  riga 1\nriga 2  " });
    expect(w.rows.get(CASE_ID)?.context).toBe("  riga 1\nriga 2  ");
  });

  it.each([["budget"], ["Context"], [""], ["x".repeat(64)]])("unknown field %j → UNKNOWN_FIELD; nothing written", async (field) => {
    const w = world();
    const result = await save(w, { caseId: CASE_ID, field, text: "x" });
    expect(codeOf(result)).toBe("UNKNOWN_FIELD");
    if (!result.ok) expect((result.error.details as { field: string }).field).toBe(field);
    expect(w.form.saveField).not.toHaveBeenCalled();
    expect(w.events).toEqual([]);
  });

  it("names budget in the UNKNOWN_FIELD error", async () => {
    const result = await save(world(), { caseId: CASE_ID, field: "budget", text: "x" });
    expect(result).toEqual(err({ code: "UNKNOWN_FIELD", message: "Unknown field: budget.", details: { field: "budget" } }));
  });

  it("5,000 characters (code points, astral included) are accepted", async () => {
    const w = world();
    expect(codeOf(await save(w, { caseId: CASE_ID, field: "results", text: "x".repeat(5_000) }))).toBe("OK");
    expect(codeOf(await save(w, { caseId: CASE_ID, field: "context", text: "😀".repeat(5_000) }))).toBe("OK");
  });

  it.each([
    ["5,001 characters", "x".repeat(5_001)],
    ["5,001 astral characters", "😀".repeat(5_001)],
    ["a NUL character", "a\u0000b"],
  ])("%s → INVALID_INPUT naming text; nothing written", async (_label, text) => {
    const w = world();
    const result = await save(w, { caseId: CASE_ID, field: "context", text });
    expect(codeOf(result)).toBe("INVALID_INPUT");
    if (!result.ok) expect((result.error.details as { fields: string[] }).fields).toEqual(["text"]);
    expect(w.cases.get).not.toHaveBeenCalled();
    expect(w.form.saveField).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed case id", { caseId: "nope", field: "context", text: "x" }, ["caseId"]],
    ["text not a string", { caseId: CASE_ID, field: "context", text: 5 }, ["text"]],
    ["a missing field", { caseId: CASE_ID, text: "x" }, ["field"]],
    ["a 65-character field", { caseId: CASE_ID, field: "x".repeat(65), text: "x" }, ["field"]],
    ["a lone surrogate in text", { caseId: CASE_ID, field: "context", text: "a\uD83Db" }, ["text"]],
  ])("%s → INVALID_INPUT naming %j", async (_label, input, fields) => {
    const result = await save(world(), input);
    expect(codeOf(result)).toBe("INVALID_INPUT");
    if (!result.ok) expect((result.error.details as { fields: string[] }).fields).toEqual(fields);
  });

  it("a soft-deleted case → NOT_FOUND; nothing written or read", async () => {
    const w = world();
    expect(codeOf(await save(w, { caseId: DELETED_CASE_ID, field: "context", text: "x" }))).toBe("NOT_FOUND");
    expect(w.form.saveField).not.toHaveBeenCalled();
    expect(w.events).toEqual([]);
  });

  it("event write fails → the previous text is put back and the event error returned", async () => {
    const w = world();
    await save(w, { caseId: CASE_ID, field: "context", text: "Vecchio" });
    const failure = err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" });
    w.cases.recordEvent.mockResolvedValueOnce(failure);
    expect(await save(w, { caseId: CASE_ID, field: "context", text: "Nuovo" })).toEqual(failure);
    expect(w.rows.get(CASE_ID)?.context).toBe("Vecchio");
    expect(w.form.saveField).toHaveBeenLastCalledWith(CASE_ID, "context", "Vecchio", actor.id);
    expect(w.events).toHaveLength(1);
  });

  it("event write fails on a first save → the field goes back to ''", async () => {
    const w = world();
    w.cases.recordEvent.mockResolvedValueOnce(err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" }));
    expect(codeOf(await save(w, { caseId: CASE_ID, field: "results", text: "Nuovo" }))).toBe("CASE_EVENT_WRITE_FAILED");
    expect(await read(w)).toEqual(ok(emptyDetailsForm()));
  });

  it("event write fails and the undo fails → logs once with correlation ids only, never the text", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const w = world();
      const failure = err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" });
      w.cases.recordEvent.mockResolvedValueOnce(failure);
      w.form.saveField
        .mockImplementationOnce(async () => ok("SECRET-OLD"))
        .mockResolvedValueOnce(err({ code: "DETAILS_WRITE_FAILED", message: "x" }));
      expect(await save(w, { caseId: CASE_ID, field: "context", text: "SECRET-NEW" })).toEqual(failure);
      const lines = write.mock.calls.map(([line]) => String(line));
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({
        level: "error",
        msg: expect.stringContaining("without its details_saved event: compensation failed"),
        caseId: CASE_ID,
        actorId: actor.id,
      });
      expect(lines[0]).not.toContain("SECRET");
    } finally {
      write.mockRestore();
    }
  });

  it("passes a repository failure through without recording an event", async () => {
    const w = world();
    w.form.saveField.mockResolvedValueOnce(err({ code: "DETAILS_WRITE_FAILED", message: "down" }));
    expect(codeOf(await save(w, { caseId: CASE_ID, field: "context", text: "x" }))).toBe("DETAILS_WRITE_FAILED");
    expect(w.events).toEqual([]);
  });
});

describe("getDetailsForm", () => {
  it("a case with no row → all three fields ''", async () => {
    expect(await read(world())).toEqual(ok({ context: "", solution: "", results: "" }));
  });

  it("a row with two fields set → those two, third ''", async () => {
    const w = world();
    await save(w, { caseId: CASE_ID, field: "context", text: "C" });
    await save(w, { caseId: CASE_ID, field: "results", text: "R" });
    expect(await read(w)).toEqual(ok({ context: "C", solution: "", results: "R" }));
    expect(await read(w, OTHER_CASE_ID)).toEqual(ok(emptyDetailsForm()));
  });

  it("a soft-deleted case → NOT_FOUND without reading the form", async () => {
    const w = world();
    expect(codeOf(await read(w, DELETED_CASE_ID))).toBe("NOT_FOUND");
    expect(w.form.read).not.toHaveBeenCalled();
  });

  it("a malformed case id → INVALID_INPUT", async () => {
    expect(codeOf(await read(world(), "nope"))).toBe("INVALID_INPUT");
  });
});

describe("resolveRefs", () => {
  const resolve = (w: ReturnType<typeof world>, refs: unknown, caseId: unknown = CASE_ID) => makeResolveRefs(w.deps)(caseId, refs);

  it("resolves form_field refs to each field's current text, in the order given", async () => {
    const w = world();
    await save(w, { caseId: CASE_ID, field: "context", text: "Bando PNRR" });
    await save(w, { caseId: CASE_ID, field: "results", text: "+30%" });
    const refs = [
      { kind: "form_field", id: "results" },
      { kind: "form_field", id: "context" },
      { kind: "form_field", id: "solution" },
    ];
    expect(await resolve(w, refs)).toEqual(
      ok([
        { ref: refs[0], text: "+30%" },
        { ref: refs[1], text: "Bando PNRR" },
        { ref: refs[2], text: "" },
      ]),
    );
  });

  it("no refs → []", async () => {
    expect(await resolve(world(), [])).toEqual(ok([]));
  });

  it("an unknown key → UNKNOWN_REF naming it; nothing resolved", async () => {
    const w = world();
    const result = await resolve(w, [
      { kind: "form_field", id: "context" },
      { kind: "form_field", id: "budget" },
    ]);
    expect(result).toEqual(
      err({ code: "UNKNOWN_REF", message: expect.stringContaining("budget"), details: { kind: "form_field", id: "budget" } }),
    );
    expect(w.form.read).not.toHaveBeenCalled();
  });

  it("an asset ref is not resolvable yet → UNKNOWN_REF", async () => {
    const kind = "asset";
    const w = world();
    const result = await resolve(w, [{ kind, id: "eeeeeeee-0000-4000-8000-000000000001" }]);
    expect(codeOf(result)).toBe("UNKNOWN_REF");
    if (!result.ok) expect(result.error.details).toEqual({ kind, id: "eeeeeeee-0000-4000-8000-000000000001" });
    expect(w.form.read).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown kind", [{ kind: "budget", id: "context" }], ["refs.0.kind"]],
    ["the retired text kind", [{ kind: "text", id: "eeeeeeee-0000-4000-8000-000000000001" }], ["refs.0.kind"]],
    ["refs not an array", "context", ["refs"]],
    ["a 65-character ref id", [{ kind: "form_field", id: "x".repeat(65) }], ["refs.0.id"]],
    ["101 refs", Array.from({ length: 101 }, () => ({ kind: "form_field", id: "context" })), ["refs"]],
  ])("%s → INVALID_INPUT naming %j", async (_label, refs, fields) => {
    const result = await resolve(world(), refs);
    expect(codeOf(result)).toBe("INVALID_INPUT");
    if (!result.ok) expect((result.error.details as { fields: string[] }).fields).toEqual(fields);
  });

  it("a malformed case id → INVALID_INPUT naming caseId", async () => {
    const result = await resolve(world(), [], "nope");
    expect(codeOf(result)).toBe("INVALID_INPUT");
    if (!result.ok) expect((result.error.details as { fields: string[] }).fields).toEqual(["caseId"]);
  });

  it("a soft-deleted case → NOT_FOUND without reading the form", async () => {
    const w = world();
    expect(codeOf(await resolve(w, [{ kind: "form_field", id: "context" }], DELETED_CASE_ID))).toBe("NOT_FOUND");
    expect(w.form.read).not.toHaveBeenCalled();
  });
});

