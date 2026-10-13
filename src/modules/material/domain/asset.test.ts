import { describe, expect, it } from "vitest";
import { confirmInputSchema } from "./asset";
import { parseInput } from "./validation";

const base = {
  caseId: "aaaaaaaa-0000-4000-8000-000000000001",
  assetId: "bbbbbbbb-0000-4000-8000-000000000001",
  contentType: "image/png",
};

describe("confirmInputSchema.fileName", () => {
  it.each(["moodboard.png", "Progetto finale – v2 (è).pdf", "文件.docx", " padded.md "])("accepts %j", (fileName) => {
    const parsed = parseInput(confirmInputSchema, { ...base, fileName });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.fileName).toBe(fileName.trim());
  });

  it.each([
    ["NUL", "a\u0000b.png"],
    ["a tab inside", "a\tb.png"],
    ["a newline inside", "a\nb.png"],
    ["ESC", "a\u001Bb.png"],
    ["DEL", "a\u007Fb.png"],
    ["a C1 control", "a\u0085b.png"],
    ["C1 upper bound", "a\u009Fb.png"],
    ["LRE", "a‪b.png"],
    ["RLO", "invoice‮gnp.exe"],
    ["LRI", "a⁦b.png"],
    ["PDI", "a⁩b.png"],
  ])("rejects %s as INVALID_INPUT naming fileName", (_label, fileName) => {
    const parsed = parseInput(confirmInputSchema, { ...base, fileName });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("INVALID_INPUT");
      expect((parsed.error.details as { fields: string[] }).fields).toEqual(["fileName"]);
    }
  });
});
