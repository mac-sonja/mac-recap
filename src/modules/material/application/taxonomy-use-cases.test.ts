import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { AssetRepository } from "@/modules/material/ports/asset-repository";
import type { TaxonomyRepository } from "@/modules/material/ports/taxonomy-repository";
import type { TextItemRepository } from "@/modules/material/ports/text-item-repository";
import type { DeliverableKind, TaxonomyTerm } from "@/modules/material/domain/taxonomy";
import { err, ok } from "@/shared/result";
import type { CaseStudies, MaterialDeps } from "./deps";
import { makeGetCaseTerms } from "./get-case-terms";
import { makeListTerms } from "./list-terms";
import { makeSetDeliverableTerms } from "./set-deliverable-terms";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_CASE_ID = "aaaaaaaa-0000-4000-8000-000000000002";
const DELETED_CASE_ID = "aaaaaaaa-0000-4000-8000-000000000003";
const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const UNTAGGED_ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const REMOVED_ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000003";
const OTHER_ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000004";
const TEXT_ID = "eeeeeeee-0000-4000-8000-000000000001";
const REMOVED_TEXT_ID = "eeeeeeee-0000-4000-8000-000000000002";
const UNKNOWN_ID = "dddddddd-0000-4000-8000-000000000009";

const SEEDED: TaxonomyTerm[] = [
  { kind: "tag", key: "branding", label: "Branding" },
  { kind: "tag", key: "app", label: "App" },
  { kind: "property", key: "hero_image", label: "Immagine principale" },
  { kind: "flag", key: "confidential", label: "Riservato" },
];

interface Deliverable {
  refKind: DeliverableKind;
  refId: string;
  caseId: string;
  removed: boolean;
}

/**
 * In-memory world mirroring `set_material_terms` / `case_material_terms`: three
 * cases (one soft-deleted), live and removed deliverables, links by key, the
 * recorded events and the case status (which must never change).
 */
function world(terms: TaxonomyTerm[] = SEEDED) {
  const deliverables: Deliverable[] = [
    { refKind: "asset", refId: ASSET_ID, caseId: CASE_ID, removed: false },
    { refKind: "asset", refId: UNTAGGED_ASSET_ID, caseId: CASE_ID, removed: false },
    { refKind: "asset", refId: REMOVED_ASSET_ID, caseId: CASE_ID, removed: true },
    { refKind: "text", refId: TEXT_ID, caseId: CASE_ID, removed: false },
    { refKind: "text", refId: REMOVED_TEXT_ID, caseId: CASE_ID, removed: true },
    { refKind: "asset", refId: OTHER_ASSET_ID, caseId: OTHER_CASE_ID, removed: false },
  ];
  /** `${refKind}:${refId}` → keys */
  const links = new Map<string, Set<string>>();
  const linkKey = (refKind: string, refId: string) => `${refKind}:${refId}`;
  const keysOf = (refKind: string, refId: string) => [...(links.get(linkKey(refKind, refId)) ?? [])];
  const termOf = (key: string) => terms.find((t) => t.key === key);
  const live = new Set([CASE_ID, OTHER_CASE_ID]);
  const events: { caseId: string; type: string; data: unknown; actorId: string }[] = [];
  const status: Record<string, string> = { [CASE_ID]: "approved", [OTHER_CASE_ID]: "draft" };

  const link = (refKind: DeliverableKind, refId: string, ...keys: string[]) => {
    const set = links.get(linkKey(refKind, refId)) ?? new Set<string>();
    for (const key of keys) set.add(key);
    links.set(linkKey(refKind, refId), set);
  };

  const taxonomy = {
    listTerms: vi.fn<TaxonomyRepository["listTerms"]>(async () =>
      ok([...terms].sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key))),
    ),
    setTerms: vi.fn<TaxonomyRepository["setTerms"]>(async ({ caseId, refKind, refId, kind, keys }) => {
      const target = deliverables.find((d) => d.refKind === refKind && d.refId === refId && d.caseId === caseId && !d.removed);
      if (!live.has(caseId) || !target) return err({ code: "NOT_FOUND", message: "none" });
      const unknown = keys.find((key) => termOf(key)?.kind !== kind);
      if (unknown !== undefined) return err({ code: "UNKNOWN_TERM", message: `Unknown term: ${unknown}.`, details: { key: unknown } });
      const current = keysOf(refKind, refId);
      const previous = current.filter((key) => termOf(key)?.kind === kind).sort();
      links.set(linkKey(refKind, refId), new Set([...current.filter((key) => termOf(key)?.kind !== kind), ...keys]));
      return ok(previous);
    }),
    caseTerms: vi.fn<TaxonomyRepository["caseTerms"]>(async (caseId) =>
      ok(
        live.has(caseId)
          ? deliverables
              .filter((d) => d.caseId === caseId && !d.removed)
              .map(({ refKind, refId }) => ({
                refKind,
                refId,
                terms: keysOf(refKind, refId).map((key) => ({ kind: termOf(key)!.kind, key })),
              }))
          : [],
      ),
    ),
  } satisfies TaxonomyRepository;

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
        throw new Error(`taxonomy use case called ${name}.${String(prop)}`);
      },
    });

  const deps: MaterialDeps = {
    assets: unused<AssetRepository>("assets"),
    texts: unused<TextItemRepository>("texts"),
    taxonomy,
    storage: null,
    cases,
    newId: () => "unused",
  };
  return { deps, taxonomy, cases, events, status, keysOf, link };
}

const codeOf = (result: { ok: boolean; error?: { code: string } }) => (result.ok ? "OK" : result.error?.code);
const set = (w: ReturnType<typeof world>, input: unknown) => makeSetDeliverableTerms(w.deps)(actor, input);
const tagAsset = (keys: string[]) => ({ caseId: CASE_ID, refKind: "asset", refId: ASSET_ID, kind: "tag", keys });

describe("listTerms", () => {
  it("groups by kind, ordered by label", async () => {
    const w = world();
    expect(await makeListTerms(w.deps)()).toEqual(
      ok({
        tag: [
          { key: "app", label: "App" },
          { key: "branding", label: "Branding" },
        ],
        property: [{ key: "hero_image", label: "Immagine principale" }],
        flag: [{ key: "confidential", label: "Riservato" }],
      }),
    );
  });

  it("terms seeded for tag only: property and flag are []", async () => {
    const w = world(SEEDED.filter((t) => t.kind === "tag"));
    const result = await makeListTerms(w.deps)();
    expect(result.ok && result.value).toEqual({
      tag: [
        { key: "app", label: "App" },
        { key: "branding", label: "Branding" },
      ],
      property: [],
      flag: [],
    });
  });

  it("nothing seeded: every kind is []", async () => {
    expect(await makeListTerms(world([]).deps)()).toEqual(ok({ tag: [], property: [], flag: [] }));
  });

  it("passes a repository failure through", async () => {
    const w = world();
    w.taxonomy.listTerms.mockResolvedValueOnce(err({ code: "TAXONOMY_LOOKUP_FAILED", message: "down" }));
    expect(codeOf(await makeListTerms(w.deps)())).toBe("TAXONOMY_LOOKUP_FAILED");
  });
});

describe("setDeliverableTerms", () => {
  it("set: links a and b, records terms_set with the keys only, sorted; status unchanged", async () => {
    const w = world();
    const result = await set(w, tagAsset(["branding", "app"]));
    expect(result).toEqual(ok({ refKind: "asset", refId: ASSET_ID, kind: "tag", keys: ["app", "branding"] }));
    expect(w.keysOf("asset", ASSET_ID).sort()).toEqual(["app", "branding"]);
    expect(w.events).toEqual([
      {
        caseId: CASE_ID,
        type: "terms_set",
        data: { refKind: "asset", refId: ASSET_ID, kind: "tag", keys: ["app", "branding"] },
        actorId: actor.id,
      },
    ]);
    expect(JSON.stringify(w.events)).not.toMatch(/Branding|App"/);
    expect(w.status[CASE_ID]).toBe("approved");
  });

  it("replace: tag b replaces tag a; property and flag untouched", async () => {
    const w = world();
    w.link("asset", ASSET_ID, "branding", "hero_image", "confidential");
    expect(codeOf(await set(w, tagAsset(["app"])))).toBe("OK");
    expect(w.keysOf("asset", ASSET_ID).sort()).toEqual(["app", "confidential", "hero_image"]);
  });

  it("clear: [] removes the tag links and still records the event", async () => {
    const w = world();
    w.link("asset", ASSET_ID, "branding", "hero_image");
    expect(await set(w, tagAsset([]))).toEqual(ok({ refKind: "asset", refId: ASSET_ID, kind: "tag", keys: [] }));
    expect(w.keysOf("asset", ASSET_ID)).toEqual(["hero_image"]);
    expect(w.events).toEqual([expect.objectContaining({ type: "terms_set", data: expect.objectContaining({ keys: [] }) })]);
  });

  it("several terms of every kind are allowed", async () => {
    const terms: TaxonomyTerm[] = [
      { kind: "property", key: "p1", label: "P1" },
      { kind: "property", key: "p2", label: "P2" },
      { kind: "flag", key: "f1", label: "F1" },
      { kind: "flag", key: "f2", label: "F2" },
    ];
    const w = world(terms);
    expect(codeOf(await set(w, { ...tagAsset(["p1", "p2"]), kind: "property" }))).toBe("OK");
    expect(codeOf(await set(w, { ...tagAsset(["f1", "f2"]), kind: "flag" }))).toBe("OK");
    expect(w.keysOf("asset", ASSET_ID).sort()).toEqual(["f1", "f2", "p1", "p2"]);
  });

  it("drops duplicate keys and sorts them bytewise", async () => {
    const w = world();
    const result = await set(w, tagAsset(["branding", "app", "app", "branding", "app"]));
    expect(result.ok && result.value.keys).toEqual(["app", "branding"]);
    expect(w.taxonomy.setTerms).toHaveBeenCalledWith(expect.objectContaining({ keys: ["app", "branding"] }));
  });

  it("a text item works like an asset", async () => {
    const w = world();
    const result = await set(w, { caseId: CASE_ID, refKind: "text", refId: TEXT_ID, kind: "flag", keys: ["confidential"] });
    expect(result).toEqual(ok({ refKind: "text", refId: TEXT_ID, kind: "flag", keys: ["confidential"] }));
    expect(w.keysOf("text", TEXT_ID)).toEqual(["confidential"]);
    expect(w.events).toHaveLength(1);
  });

  it("unknown key → UNKNOWN_TERM naming it; nothing changes", async () => {
    const w = world();
    w.link("asset", ASSET_ID, "branding");
    const result = await set(w, tagAsset(["app", "nope"]));
    expect(result).toEqual(err({ code: "UNKNOWN_TERM", message: expect.stringContaining("nope"), details: { key: "nope" } }));
    expect(w.keysOf("asset", ASSET_ID)).toEqual(["branding"]);
    expect(w.events).toEqual([]);
  });

  it("wrong kind (a property key sent as tag) → UNKNOWN_TERM; nothing changes", async () => {
    const w = world();
    expect(codeOf(await set(w, tagAsset(["hero_image"])))).toBe("UNKNOWN_TERM");
    expect(w.keysOf("asset", ASSET_ID)).toEqual([]);
    expect(w.events).toEqual([]);
  });

  it.each([["Branding"], [""], ["9lives"], ["has space"], ["tag\u0000"]])(
    "a malformed key %j → UNKNOWN_TERM without reaching the repository",
    async (key) => {
      const w = world();
      const result = await set(w, tagAsset(["app", key]));
      expect(codeOf(result)).toBe("UNKNOWN_TERM");
      expect(w.taxonomy.setTerms).not.toHaveBeenCalled();
      expect(w.events).toEqual([]);
    },
  );

  it.each([
    ["a removed asset", { ...tagAsset(["app"]), refId: REMOVED_ASSET_ID }],
    ["a removed text item", { caseId: CASE_ID, refKind: "text", refId: REMOVED_TEXT_ID, kind: "tag", keys: ["app"] }],
    ["an unknown deliverable", { ...tagAsset(["app"]), refId: UNKNOWN_ID }],
    ["an asset id sent as a text item", { ...tagAsset(["app"]), refKind: "text" }],
    ["another case's deliverable", { ...tagAsset(["app"]), refId: OTHER_ASSET_ID }],
    ["a soft-deleted case", { ...tagAsset(["app"]), caseId: DELETED_CASE_ID }],
  ])("%s → NOT_FOUND; nothing changes", async (_label, input) => {
    const w = world();
    expect(codeOf(await set(w, input))).toBe("NOT_FOUND");
    expect(w.keysOf(String(input.refKind), String(input.refId))).toEqual([]);
    expect(w.events).toEqual([]);
  });

  it.each([
    ["a malformed case id", { ...tagAsset(["app"]), caseId: "nope" }, ["caseId"]],
    ["an unknown ref kind", { ...tagAsset(["app"]), refKind: "form_field" }, ["refKind"]],
    ["an unknown kind", { ...tagAsset(["app"]), kind: "category" }, ["kind"]],
    ["keys not an array", { ...tagAsset([]), keys: "app" }, ["keys"]],
    ["101 keys", tagAsset(Array.from({ length: 101 }, (_, n) => `k${n}`)), ["keys"]],
    ["a 65-char key", tagAsset(["app", "x".repeat(65)]), ["keys"]],
    ["a missing ref id", { caseId: CASE_ID, refKind: "asset", kind: "tag", keys: [] }, ["refId"]],
  ])("%s → INVALID_INPUT naming %j", async (_label, input, fields) => {
    const w = world();
    const result = await set(w, input);
    expect(codeOf(result)).toBe("INVALID_INPUT");
    if (!result.ok) expect((result.error.details as { fields: string[] }).fields).toEqual(fields);
    expect(w.cases.get).not.toHaveBeenCalled();
  });

  it("100 keys and a 64-char key are within the input bounds (reach the term check)", async () => {
    const many = await set(world(), tagAsset(Array.from({ length: 100 }, (_, n) => `k${n}`)));
    expect(codeOf(many)).toBe("UNKNOWN_TERM");
    const long = await set(world(), tagAsset(["x".repeat(64)]));
    expect(long).toEqual(err(expect.objectContaining({ code: "UNKNOWN_TERM", details: { key: "x".repeat(64) } })));
  });

  it("event write fails → the previous keys are put back and the event error returned", async () => {
    const w = world();
    w.link("asset", ASSET_ID, "branding", "hero_image");
    const failure = err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" });
    w.cases.recordEvent.mockResolvedValueOnce(failure);
    expect(await set(w, tagAsset(["app"]))).toEqual(failure);
    expect(w.keysOf("asset", ASSET_ID).sort()).toEqual(["branding", "hero_image"]);
    expect(w.taxonomy.setTerms).toHaveBeenLastCalledWith({
      caseId: CASE_ID,
      refKind: "asset",
      refId: ASSET_ID,
      kind: "tag",
      keys: ["branding"],
    });
  });

  it("event write fails and the undo fails → logs once with correlation ids only", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const w = world();
      const failure = err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" });
      w.cases.recordEvent.mockResolvedValueOnce(failure);
      w.taxonomy.setTerms.mockImplementationOnce(async () => ok([])).mockResolvedValueOnce(err({ code: "TERMS_WRITE_FAILED", message: "x" }));
      expect(await set(w, tagAsset(["app"]))).toEqual(failure);
      const lines = write.mock.calls.map(([line]) => String(line));
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({
        level: "error",
        msg: expect.stringContaining("without its terms_set event: compensation failed"),
        caseId: CASE_ID,
        actorId: actor.id,
      });
    } finally {
      write.mockRestore();
    }
  });
});

describe("getCaseTerms", () => {
  it("per live deliverable: keys by kind; untagged → all []; removed ones left out", async () => {
    const w = world();
    w.link("asset", ASSET_ID, "app", "hero_image", "confidential");
    w.link("asset", REMOVED_ASSET_ID, "branding");
    w.link("text", TEXT_ID, "branding");
    expect(await makeGetCaseTerms(w.deps)({ caseId: CASE_ID })).toEqual(
      ok([
        { refKind: "asset", refId: ASSET_ID, tag: ["app"], property: ["hero_image"], flag: ["confidential"] },
        { refKind: "asset", refId: UNTAGGED_ASSET_ID, tag: [], property: [], flag: [] },
        { refKind: "text", refId: TEXT_ID, tag: ["branding"], property: [], flag: [] },
      ]),
    );
  });

  it("an unknown or soft-deleted case → NOT_FOUND without reading terms", async () => {
    const w = world();
    expect(codeOf(await makeGetCaseTerms(w.deps)({ caseId: DELETED_CASE_ID }))).toBe("NOT_FOUND");
    expect(w.taxonomy.caseTerms).not.toHaveBeenCalled();
  });

  it("a malformed case id → INVALID_INPUT", async () => {
    expect(codeOf(await makeGetCaseTerms(world().deps)({ caseId: "nope" }))).toBe("INVALID_INPUT");
  });

  it("a label rename changes nothing: reads and writes go by key", async () => {
    const terms = SEEDED.map((t) => ({ ...t }));
    const w = world(terms);
    await set(w, tagAsset(["branding"]));
    terms.find((t) => t.key === "branding")!.label = "Identità visiva";
    const read = await makeGetCaseTerms(w.deps)({ caseId: CASE_ID });
    expect(read.ok && read.value[0].tag).toEqual(["branding"]);
    expect(codeOf(await set(w, tagAsset(["branding", "app"])))).toBe("OK");
  });
});
