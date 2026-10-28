import { FormatRender } from "@/modules/rendering/templates/mac-case/v1/render/page";
import type { RenderInput } from "@/modules/rendering/templates/types";

/**
 * mac-case v1 · Video (9:16, 1080 frame): animations play, and texts come in one after
 * the other on a loop unless `animateTexts` is false, the render is still, or the
 * viewer prefers reduced motion. Room for Instagram's bar is the template's info block
 * `paddingTop`.
 */
export function Video(input: RenderInput) {
  return <FormatRender formatId="video_9_16" input={input} animatedTexts={input.options?.animateTexts !== false} />;
}
