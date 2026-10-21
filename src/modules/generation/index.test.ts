import { describe, expect, expectTypeOf, it } from "vitest";
import { MATERIAL_REF_KINDS as MATERIAL_MODULE_REF_KINDS, type MaterialRef } from "@/modules/material";
import { FORMAT_IDS } from "@/modules/rendering";
import {
  caseHistoryV0,
  caseHistoryV1,
  caseStudyDocumentSchema,
  clientIntroV1,
  MATERIAL_REF_KINDS,
  upgrade,
  validateNewDocument,
  type DocumentIssue,
  type DocumentMaterialRef,
} from "@/modules/generation";

const issuesOf = (result: { ok: boolean; error?: { details?: unknown } }) =>
  ((result.error?.details as { issues?: DocumentIssue[] } | undefined)?.issues ?? []);

const codeOf = (result: { ok: true } | { ok: false; error: { code: string } }) => (result.ok ? "ok" : result.error.code);

describe("the claim refs match material's MaterialRef", () => {
  it("has the same kinds", () => {
    expect([...MATERIAL_REF_KINDS]).toEqual([...MATERIAL_MODULE_REF_KINDS]);
  });

  it("has the same type", () => {
    expectTypeOf<DocumentMaterialRef>().toEqualTypeOf<MaterialRef>();
  });
});

describe("validateNewDocument (the I/O matrix, schema side)", () => {
  it("accepts a case history with challenge, approach, result and a title", () => {
    const doc = caseHistoryV1(FORMAT_IDS);
    expect(validateNewDocument(doc)).toEqual({ ok: true, value: doc });
  });

  it.each([
    ["approach before challenge", ["approach", "challenge", "result", "title"]],
    ["no result", ["challenge", "approach", "title"]],
    ["a title first", ["title", "challenge", "approach", "result"]],
    ["challenge twice", ["challenge", "approach", "result", "challenge"]],
    ["no blocks", []],
  ])("rejects %s with an issue naming blocks", (_name, sections) => {
    const doc = caseHistoryV1(FORMAT_IDS);
    const byName = new Map(doc.blocks.map((b) => [b.section, b]));
    doc.blocks = sections.map((section, i) => ({
      ...(byName.get(section) ?? doc.blocks[0]),
      section,
      blockId: `dddddddd-0000-4000-8000-00000000000${i}`,
      claims: [],
    }));
    const result = validateNewDocument(doc);
    expect(codeOf(result)).toBe("DOCUMENT_INVALID");
    expect(issuesOf(result).map((i) => i.path)).toContain("blocks");
  });

  it("accepts a client intro without the three narrative sections", () => {
    expect(validateNewDocument(clientIntroV1(FORMAT_IDS)).ok).toBe(true);
  });

  it.each([
    ["an about object", { about: { name: "Acme" } }],
    ["a client name", { clientName: "Acme" }],
    ["a client logo", { logo: "aaaaaaaa-0000-4000-8000-000000000009" }],
  ])("rejects %s with an unknown-key error", (_name, extra) => {
    const result = validateNewDocument({ ...caseHistoryV1(FORMAT_IDS), ...extra });
    expect(codeOf(result)).toBe("DOCUMENT_INVALID");
    expect(issuesOf(result)).toEqual([expect.objectContaining({ path: "", code: "unrecognized_keys" })]);
  });

  it("rejects a client value inside a block or claim", () => {
    const doc = caseHistoryV1(FORMAT_IDS) as unknown as { blocks: Record<string, unknown>[] };
    doc.blocks[3] = { ...doc.blocks[3], clientName: "Acme" };
    expect(issuesOf(validateNewDocument(doc))).toEqual([expect.objectContaining({ path: "blocks.3", code: "unrecognized_keys" })]);
  });

  it("rejects an about block", () => {
    const doc = caseHistoryV1(FORMAT_IDS);
    doc.blocks[3] = { ...doc.blocks[3], section: "about" };
    const result = validateNewDocument(doc);
    expect(codeOf(result)).toBe("DOCUMENT_INVALID");
    expect(issuesOf(result).map((i) => i.path)).toEqual(["blocks.3.section"]);
  });

  it("rejects formats missing pdf_a4 with FORMAT_NOT_IN_REVISION", () => {
    const doc = caseHistoryV1(FORMAT_IDS);
    delete doc.formats.pdf_a4;
    const result = validateNewDocument(doc);
    expect(result).toMatchObject({ ok: false, error: { code: "FORMAT_NOT_IN_REVISION", details: { missing: ["pdf_a4"], extra: [] } } });
  });

  it("rejects formats with story_9_16 with FORMAT_NOT_IN_REVISION", () => {
    const doc = caseHistoryV1(FORMAT_IDS);
    doc.formats.story_9_16 = doc.formats.deck_16_9;
    const result = validateNewDocument(doc);
    expect(result).toMatchObject({ ok: false, error: { code: "FORMAT_NOT_IN_REVISION", details: { missing: [], extra: ["story_9_16"] } } });
  });

  it("rejects a future version with DOCUMENT_SCHEMA_UNSUPPORTED", () => {
    expect(codeOf(validateNewDocument({ ...caseHistoryV1(FORMAT_IDS), schemaVersion: 99 }))).toBe("DOCUMENT_SCHEMA_UNSUPPORTED");
  });

  it("requires new documents to be the current version", () => {
    expect(codeOf(validateNewDocument(caseHistoryV0(FORMAT_IDS)))).toBe("DOCUMENT_SCHEMA_UNSUPPORTED");
  });

  it.each([
    ["a duplicate block id", (d: ReturnType<typeof caseHistoryV1>) => (d.blocks[3].blockId = d.blocks[0].blockId), "blocks"],
    ["a duplicate claim id", (d: ReturnType<typeof caseHistoryV1>) => (d.blocks[3].claims[0].claimId = d.blocks[0].claims[0].claimId), "blocks"],
    ["a non-uuid block id", (d: ReturnType<typeof caseHistoryV1>) => (d.blocks[0].blockId = "b1"), "blocks.0.blockId"],
    ["an unknown aspect", (d: ReturnType<typeof caseHistoryV1>) => ((d.blocks[0].claims[0] as { aspect: string }).aspect = "client"), "blocks.0.claims.0.aspect"],
    ["an unknown provenance", (d: ReturnType<typeof caseHistoryV1>) => ((d.blocks[0].claims[0] as { provenance: string }).provenance = "verified"), "blocks.0.claims.0.provenance"],
    ["an unknown ref kind", (d: ReturnType<typeof caseHistoryV1>) => ((d.blocks[0].claims[0].sourceRefs![0] as { kind: string }).kind = "client_field"), "blocks.0.claims.0.sourceRefs.0.kind"],
    ["a bad template ref", (d: ReturnType<typeof caseHistoryV1>) => (d.template = "mac-case"), "template"],
    ["a duplicate selected asset", (d: ReturnType<typeof caseHistoryV1>) => d.selectedMedia.push(d.selectedMedia[0]), "selectedMedia"],
    ["a non-uuid slot asset", (d: ReturnType<typeof caseHistoryV1>) => (d.formats.pdf_a4.slots.hero = "logo.png"), "formats.pdf_a4.slots.hero"],
    ["a malformed check", (d: ReturnType<typeof caseHistoryV1>) => (d.blocks[0].check = { by: "x", at: "now", textHash: "" }), "blocks.0.check.by"],
  ])("rejects %s", (_name, mutate, path) => {
    const doc = caseHistoryV1(FORMAT_IDS);
    mutate(doc);
    const result = validateNewDocument(doc);
    expect(codeOf(result)).toBe("DOCUMENT_INVALID");
    expect(issuesOf(result).map((i) => i.path)).toContain(path);
  });

  it("rejects a slot asset that is not in selectedMedia", () => {
    const doc = caseHistoryV1(FORMAT_IDS);
    doc.formats.social_carousel_4_5.slots.extra = "aaaaaaaa-0000-4000-8000-0000000000ff";
    const result = validateNewDocument(doc);
    expect(codeOf(result)).toBe("DOCUMENT_INVALID");
    expect(issuesOf(result).map((i) => i.path)).toEqual(["formats.social_carousel_4_5.slots.extra"]);
  });

  it("accepts empty slots and slots of selected media only", () => {
    const doc = caseHistoryV1(FORMAT_IDS);
    doc.selectedMedia = [doc.selectedMedia[0]];
    for (const entry of Object.values(doc.formats)) entry.slots = { hero: doc.selectedMedia[0], detail: null };
    expect(validateNewDocument(doc).ok).toBe(true);
  });

  const at = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`;
  it.each([
    ["block text over 5000 characters", (d: ReturnType<typeof caseHistoryV1>) => (d.blocks[0].text = "x".repeat(5001)), "blocks.0.text"],
    ["claim text over 5000 characters", (d: ReturnType<typeof caseHistoryV1>) => (d.blocks[0].claims[0].text = "x".repeat(5001)), "blocks.0.claims.0.text"],
    [
      "over 50 claims in a block",
      (d: ReturnType<typeof caseHistoryV1>) =>
        (d.blocks[3].claims = Array.from({ length: 51 }, (_, i) => ({ claimId: at(i), text: "x", aspect: "technical" as const, provenance: "generated" as const }))),
      "blocks.3.claims",
    ],
    [
      "over 50 blocks",
      (d: ReturnType<typeof caseHistoryV1>) =>
        d.blocks.push(...Array.from({ length: 47 }, (_, i) => ({ blockId: at(i), section: "note", text: "x", claims: [], check: null }))),
      "blocks",
    ],
    ["over 100 selected media", (d: ReturnType<typeof caseHistoryV1>) => d.selectedMedia.push(...Array.from({ length: 99 }, (_, i) => at(i))), "selectedMedia"],
    [
      "a text hash over 128 characters",
      (d: ReturnType<typeof caseHistoryV1>) => (d.blocks[0].check = { by: "00000000-0000-4000-8000-000000000002", at: "2026-10-21T10:00:00Z", textHash: "a".repeat(129) }),
      "blocks.0.check.textHash",
    ],
  ])("rejects %s", (_name, mutate, path) => {
    const doc = caseHistoryV1(FORMAT_IDS);
    mutate(doc);
    const result = validateNewDocument(doc);
    expect(codeOf(result)).toBe("DOCUMENT_INVALID");
    expect(issuesOf(result).map((i) => i.path)).toContain(path);
  });

  it("accepts the bounds themselves", () => {
    const doc = caseHistoryV1(FORMAT_IDS);
    doc.blocks[0].text = "x".repeat(5000);
    doc.blocks[0].check = { by: "00000000-0000-4000-8000-000000000002", at: "2026-10-21T10:00:00Z", textHash: "a".repeat(128) };
    doc.blocks[3].claims = Array.from({ length: 50 }, (_, i) => ({ claimId: at(i), text: "x", aspect: "graphic" as const, provenance: "generated" as const }));
    doc.blocks.push(...Array.from({ length: 46 }, (_, i) => ({ blockId: at(100 + i), section: "note", text: "x", claims: [], check: null })));
    doc.selectedMedia.push(...Array.from({ length: 98 }, (_, i) => at(200 + i)));
    expect(validateNewDocument(doc).ok).toBe(true);
  });

  it("names at most 10 unknown format keys", () => {
    const doc = caseHistoryV1(FORMAT_IDS);
    for (let i = 0; i < 12; i++) doc.formats[`story_${i}`] = doc.formats.deck_16_9;
    const result = validateNewDocument(doc);
    expect(result).toMatchObject({ ok: false, error: { code: "FORMAT_NOT_IN_REVISION", details: { extraCount: 12 } } });
    if (!result.ok) expect((result.error.details as { extra: string[] }).extra).toHaveLength(10);
  });

  it("accepts a checked block and an edited or added claim", () => {
    const doc = caseHistoryV1(FORMAT_IDS);
    doc.blocks[0].check = { by: "00000000-0000-4000-8000-000000000002", at: "2026-10-21T10:00:00.000Z", textHash: "abc" };
    doc.blocks[0].claims[0].provenance = "human_edited";
    doc.blocks[1].claims[0] = { claimId: "eeeeeeee-0000-4000-8000-000000000001", text: "x", aspect: "graphic", provenance: "human_added" };
    expect(validateNewDocument(doc).ok).toBe(true);
  });
});

describe("upgrade", () => {
  it("returns a current document as it is", () => {
    const doc = caseHistoryV1(FORMAT_IDS);
    expect(upgrade(doc)).toEqual({ ok: true, value: doc });
  });

  it("takes the v0 fixture to v1 without touching the input", () => {
    const v0 = caseHistoryV0(FORMAT_IDS);
    const before = structuredClone(v0);
    const result = upgrade(v0);
    expect(v0).toEqual(before);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = result.value;
    expect(caseStudyDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc).toMatchObject({ schemaVersion: 1, kind: "case_history", template: "mac-case@1", selectedMedia: v0.media });
    expect(doc.blocks.map((b) => [b.blockId, b.section, b.check])).toEqual(v0.blocks.map((b) => [b.id, b.section, null]));
    expect(doc.blocks.flatMap((b) => b.claims.map((c) => c.provenance))).toEqual(["generated", "generated"]);
    expect(doc.blocks[2].claims[0].sourceRefs).toEqual(v0.blocks[2].claims[0].sourceRefs);
    expect(doc.formats).toEqual(v0.formats);
    expect(doc.formats).not.toBe(v0.formats);
  });

  it("refuses a v0 document that breaks the narrative rule", () => {
    const v0 = caseHistoryV0(FORMAT_IDS);
    v0.blocks.reverse();
    const result = upgrade(v0);
    expect(codeOf(result)).toBe("DOCUMENT_INVALID");
    expect(issuesOf(result).map((i) => i.path)).toContain("blocks");
  });

  it("refuses a malformed v0 document with DOCUMENT_INVALID", () => {
    expect(codeOf(upgrade({ ...caseHistoryV0(FORMAT_IDS), templateVersion: "one" }))).toBe("DOCUMENT_INVALID");
  });

  it.each([
    ["a future version", { ...caseHistoryV1(FORMAT_IDS), schemaVersion: 99 }],
    ["a negative version", { ...caseHistoryV1(FORMAT_IDS), schemaVersion: -1 }],
    ["a string version", { ...caseHistoryV1(FORMAT_IDS), schemaVersion: "1" }],
    ["no version", { kind: "case_history" }],
    ["null", null],
    ["an array", []],
    ["a string", "doc"],
  ])("refuses %s with DOCUMENT_SCHEMA_UNSUPPORTED", (_name, doc) => {
    expect(codeOf(upgrade(doc))).toBe("DOCUMENT_SCHEMA_UNSUPPORTED");
  });
});
