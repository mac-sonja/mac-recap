import { describe, expect, it } from "vitest";
import {
  CLIENT_MATERIAL_FILE_TYPES,
  CLIENT_MATERIAL_MAX_BYTES,
} from "@/modules/case-study/domain/client-material";
import { clientMaterialKey } from "@/modules/case-study/adapters/client-material-key";
import { clientAssetKey } from "@/modules/material/adapters/asset-key";
import { ALLOWED_CONTENT_TYPES, ALLOWED_FILE_TYPES, MAX_FILE_BYTES } from "@/modules/material/domain/files";

// The case-study module copies the case material types for client files (module
// boundary: it never imports the material module). This keeps both lists equal.
describe("client material types", () => {
  it("are exactly the case material types, with the same extension and kind", () => {
    expect(CLIENT_MATERIAL_FILE_TYPES).toEqual(ALLOWED_FILE_TYPES);
  });

  it("share the case material size limit", () => {
    expect(CLIENT_MATERIAL_MAX_BYTES).toBe(MAX_FILE_BYTES);
  });

  it("are read by the rendition worker at the key the case-study module stores them at (Story 4.5c-2)", () => {
    const clientId = "cccccccc-0000-4000-8000-000000000001";
    const assetId = "bbbbbbbb-0000-4000-8000-000000000001";
    for (const type of ALLOWED_CONTENT_TYPES) expect(clientAssetKey(clientId, assetId, type)).toBe(clientMaterialKey(clientId, assetId, type));
  });
});
