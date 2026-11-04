import { describe, expect, it } from "vitest";
import { bundleHash, contentHash } from "@/modules/rendering/application/content-hash";
import { bundleHashInput, contentHashInput, EXPORT_RENDER_VERSION, type ExportPartContent } from "@/modules/rendering/domain/export";

const CASE_A = "cccccccc-0000-4000-8000-000000000001";
const CASE_B = "cccccccc-0000-4000-8000-000000000002";
const REV_A = "eeeeeeee-0000-4000-8000-000000000001";
const REV_B = "eeeeeeee-0000-4000-8000-000000000002";

const part = (over: { caseId?: string; revisionId?: string } = {}): ExportPartContent => ({
  part: { subject: { kind: "case", id: over.caseId ?? CASE_A }, revisionId: over.revisionId ?? REV_A },
  template: "mac-case@1",
  client: {
    name: "Lumen Srl",
    sector: "Lusso",
    description: "Luci per la casa.",
    logoId: "ffffffff-0000-4000-8000-000000000001",
    results: [{ label: "negozi", value: "12" }],
    testimonial: null,
  },
  case: {
    year: 2026,
    services: ["branding", "digital"],
    results: [{ label: "visitatori", value: "1.800" }],
    testimonial: { quote: "Un lavoro preciso.", author: "Anna" },
  },
});

const base = contentHash([part()], "presentazione_16_9");

describe("contentHash (Story 5.3)", () => {
  it("is 64 hex characters and stable for the same content", () => {
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash([part()], "presentazione_16_9")).toBe(base);
  });

  it("ignores the case of ids and the key order of the input", () => {
    const upper = part({ caseId: CASE_A.toUpperCase(), revisionId: REV_A.toUpperCase() });
    const reordered: ExportPartContent = { case: upper.case, client: upper.client, template: upper.template, part: upper.part };
    expect(contentHash([reordered], "presentazione_16_9")).toBe(base);
  });

  const changes: [string, (p: ExportPartContent) => ExportPartContent][] = [
    ["the case", (p) => ({ ...p, part: { ...p.part, subject: { kind: "case", id: CASE_B } } })],
    ["the revision", (p) => ({ ...p, part: { ...p.part, revisionId: REV_B } })],
    ["the template", (p) => ({ ...p, template: "mac-case@2" })],
    ["the client's name", (p) => ({ ...p, client: { ...p.client, name: "Lumen Spa" } })],
    ["the client's sector", (p) => ({ ...p, client: { ...p.client, sector: "Moda" } })],
    ["the client's description", (p) => ({ ...p, client: { ...p.client, description: "Altro." } })],
    ["the client's logo", (p) => ({ ...p, client: { ...p.client, logoId: "ffffffff-0000-4000-8000-000000000002" } })],
    ["the client's logo removed", (p) => ({ ...p, client: { ...p.client, logoId: null } })],
    ["the client's results", (p) => ({ ...p, client: { ...p.client, results: [] } })],
    ["the client's testimonial", (p) => ({ ...p, client: { ...p.client, testimonial: { quote: "Sì.", author: "Bo" } } })],
    ["the case's year", (p) => ({ ...p, case: { ...p.case, year: 2025 } })],
    ["the case's services", (p) => ({ ...p, case: { ...p.case, services: ["branding"] } })],
    ["the services' order", (p) => ({ ...p, case: { ...p.case, services: ["digital", "branding"] } })],
    ["the case's results", (p) => ({ ...p, case: { ...p.case, results: [{ label: "visitatori", value: "1.900" }] } })],
    ["the case's testimonial author", (p) => ({ ...p, case: { ...p.case, testimonial: { quote: "Un lavoro preciso.", author: "Bea" } } })],
    ["the case's testimonial removed", (p) => ({ ...p, case: { ...p.case, testimonial: null } })],
  ];

  it.each(changes)("changes with %s", (_, change) => {
    expect(contentHash([change(part())], "presentazione_16_9")).not.toBe(base);
  });

  it("covers EXPORT_RENDER_VERSION, so a bump draws every export again", () => {
    expect(JSON.parse(contentHashInput([part()], "presentazione_16_9"))[1]).toBe(EXPORT_RENDER_VERSION);
    expect(contentHashInput([part()], "presentazione_16_9")).toContain('"mac-case@1"');
  });

  it("changes with the format", () => {
    expect(contentHash([part()], "carosello_1_1")).not.toBe(base);
  });

  it("changes with the parts' order and number", () => {
    const a = part();
    const b = part({ caseId: CASE_B, revisionId: REV_B });
    expect(contentHash([a, b], "presentazione_16_9")).not.toBe(contentHash([b, a], "presentazione_16_9"));
    expect(contentHash([a, b], "presentazione_16_9")).not.toBe(base);
  });

  it("does not mix fields up: a value moved to another field gives another hash", () => {
    const moved = part();
    const swapped = { ...moved, client: { ...moved.client, name: moved.client.sector, sector: moved.client.name } };
    expect(contentHash([swapped], "presentazione_16_9")).not.toBe(base);
  });
});

describe("bundleHash (Story 5.4)", () => {
  const pdf = { format: "presentazione_16_9" as const, contentHash: contentHash([part()], "presentazione_16_9") };
  const carosello = { format: "carosello_1_1" as const, contentHash: contentHash([part()], "carosello_1_1") };
  const names = ["LUM-2026-01 Rebrand Lumen – Presentazione.pdf", "Carosello/"];
  const bundle = bundleHash([pdf, carosello], names);

  it("is a stable sha256", () => {
    expect(bundle).toMatch(/^[0-9a-f]{64}$/);
    expect(bundleHash([pdf, carosello], names)).toBe(bundle);
  });

  it("doesn't depend on the order the formats or names come in", () => {
    expect(bundleHash([carosello, pdf], [...names].reverse())).toBe(bundle);
    expect(bundleHashInput([carosello, pdf], names)).toBe(bundleHashInput([pdf, carosello], names));
  });

  it("changes when a format's own hash changes, when the formats change, or when the names inside change", () => {
    const renamed = { ...carosello, contentHash: contentHash([{ ...part(), client: { ...part().client, name: "Lumen Spa" } }], "carosello_1_1") };
    expect(bundleHash([pdf, renamed], names)).not.toBe(bundle);
    expect(bundleHash([pdf], names)).not.toBe(bundle);
    expect(bundleHash([pdf, carosello], ["LUM-2026-01 Altro nome – Presentazione.pdf", "Carosello/"])).not.toBe(bundle);
  });

  it("is never a single format's hash", () => {
    expect(bundle).not.toBe(pdf.contentHash);
    expect(bundle).not.toBe(carosello.contentHash);
  });
});
