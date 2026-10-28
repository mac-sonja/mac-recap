import { createElement, type ReactElement } from "react";
import type { FormatId } from "@/modules/rendering/domain/formats";
import { layouts } from "@/modules/rendering/templates/mac-case/v1/layouts";
import { defaultPages, starterPages } from "@/modules/rendering/templates/mac-case/v1/pages";
import { Carosello } from "@/modules/rendering/templates/mac-case/v1/render/carosello";
import { Presentazione } from "@/modules/rendering/templates/mac-case/v1/render/presentazione";
import { Video } from "@/modules/rendering/templates/mac-case/v1/render/video";
import { textStyles } from "@/modules/rendering/templates/mac-case/v1/styles";
import type { RenderInput, TemplateVersion } from "@/modules/rendering/templates/types";

/** One renderer per format (Story 3.5). */
const RENDERERS: Readonly<Record<FormatId, (input: RenderInput) => ReactElement>> = Object.freeze({
  presentazione_16_9: Presentazione,
  carosello_1_1: Carosello,
  video_9_16: Video,
});

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
  render: (formatId: FormatId, input: RenderInput) => createElement(RENDERERS[formatId], input),
});
