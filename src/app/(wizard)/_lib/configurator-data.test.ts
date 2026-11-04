import { describe, expect, it } from "vitest";
import type { CaseClientInfo, CaseStudy } from "@/modules/case-study";
import type { DetailsForm, ListedAsset } from "@/modules/material";
import { editableFieldsOf, imagePoolOf } from "./configurator-data";

const A = "bbbbbbbb-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const C = "bbbbbbbb-0000-4000-8000-00000000000c";
const V = "bbbbbbbb-0000-4000-8000-00000000000f";

const listed = (id: string, kind: ListedAsset["kind"]): ListedAsset => ({
  id,
  kind,
  originalFileName: `${id}.bin`,
  contentType: kind === "video" ? "video/mp4" : "image/png",
  sizeBytes: 1000,
  createdAt: "2026-10-14T10:00:00+00:00",
  isFavourite: false,
  thumbnailUrl: null,
  thumbnailPending: false,
});

describe("imagePoolOf", () => {
  it("keeps the case's images, oldest first, that either document references; never a video or an unused image", () => {
    const doc = { blocks: [{ background: { kind: "image", assetId: C.toUpperCase() } }] };
    const generated = { elements: [{ type: "animation", assetIds: [A, V] }] };
    expect(imagePoolOf([listed(A, "image"), listed(B, "image"), listed(C, "image"), listed(V, "video")], [doc, generated])).toEqual([A, C]);
    expect(imagePoolOf([listed(A, "image")], [])).toEqual([]);
  });
});

describe("editableFieldsOf (Story 4.3d)", () => {
  const info: CaseClientInfo = {
    clientId: "cccccccc-0000-4000-8000-000000000001",
    name: "Lumen Srl",
    industry: { key: "illuminazione", label: "Illuminazione" },
    description: "Luci",
    logoId: "eeeeeeee-0000-4000-8000-000000000001",
    brief: { context: "C", solution: "S", results: [{ label: "client", value: "1" }], testimonialQuote: "client", testimonialAuthor: "client" },
  };
  const form: DetailsForm = { context: "", solution: "", results: [{ label: "Vendite", value: "+30%" }], testimonialQuote: "Bravi", testimonialAuthor: "Ada" };
  const caseStudy = { year: 2026, businessLines: ["branding", "video"] } as unknown as CaseStudy;

  it("holds every field updateClient needs and the case's own year, services, results and testimonial (never the client's)", () => {
    expect(editableFieldsOf(caseStudy, info, form)).toEqual({
      client: { id: info.clientId, name: "Lumen Srl", industry: "illuminazione", description: "Luci", logoId: info.logoId },
      case: { year: 2026, businessLines: ["branding", "video"], results: [{ label: "Vendite", value: "+30%" }], testimonial: { quote: "Bravi", author: "Ada" } },
    });
  });

  it("a client without a sector, description or logo has null or empty ones", () => {
    expect(editableFieldsOf(caseStudy, { ...info, industry: null, description: null, logoId: null }, form).client).toMatchObject({
      industry: null,
      description: "",
      logoId: null,
    });
  });
});
