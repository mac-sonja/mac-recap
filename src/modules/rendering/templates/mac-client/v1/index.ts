import { macCaseV1 } from "@/modules/rendering/templates/mac-case/v1";
import { defaultPages, starterPages } from "@/modules/rendering/templates/mac-client/v1/pages";
import type { TemplateVersion } from "@/modules/rendering/templates/types";

/**
 * The client intro-and-outro template, version 1 (Story 3.11): a placeholder until the
 * design team's cover and outro ship as mac-client@2 (owner, 2026-11-06). Its own default
 * pages; mac-case@1's renderers, layouts and text styles. Published: the files of this
 * folder never change (their hashes are tested); a change is a new version folder.
 */
export const macClientV1: TemplateVersion = Object.freeze({
  ref: "mac-client@1",
  kind: "client_intro",
  layouts: macCaseV1.layouts,
  defaultPages,
  starterPages,
  textStyles: macCaseV1.textStyles,
  render: macCaseV1.render,
});
