import { describe, expect, it } from "vitest";
import {
  CLIENT_MATERIAL_FILE_TYPES,
  CLIENT_MATERIAL_MAX_BYTES,
} from "@/modules/case-study/domain/client-material";
import { ALLOWED_FILE_TYPES, MAX_FILE_BYTES } from "@/modules/material/domain/files";

// The case-study module copies the case material types for client files (module
// boundary: it never imports the material module). This keeps both lists equal.
describe("client material types", () => {
  it("are exactly the case material types, with the same extension and kind", () => {
    expect(CLIENT_MATERIAL_FILE_TYPES).toEqual(ALLOWED_FILE_TYPES);
  });

  it("share the case material size limit", () => {
    expect(CLIENT_MATERIAL_MAX_BYTES).toBe(MAX_FILE_BYTES);
  });
});
