import { layouts } from "@/modules/rendering/templates/mac-case/v1/layouts";
import { defaultPages, starterPages } from "@/modules/rendering/templates/mac-case/v1/pages";
import { textStyles } from "@/modules/rendering/templates/mac-case/v1/styles";
import type { TemplateVersion } from "@/modules/rendering/templates/types";

/**
 * The case history template, version 1 (Story 3.4), from the Figma frames "MAC-TF-AI".
 * Published: the files of this folder never change (their hashes are tested); a
 * change is a new version folder.
 */
export const macCaseV1: TemplateVersion = Object.freeze({
  ref: "mac-case@1",
  layouts,
  defaultPages,
  starterPages,
  textStyles,
});
