import { FormatRender } from "@/modules/rendering/templates/mac-case/v1/render/page";
import type { RenderInput } from "@/modules/rendering/templates/types";

/** mac-case v1 · Carosello (1:1, drawn on a 1000 frame, exported at 1080): static slides, a ZIP of PNGs. */
export function Carosello(input: RenderInput) {
  return <FormatRender formatId="carosello_1_1" input={input} animatedTexts={false} />;
}
