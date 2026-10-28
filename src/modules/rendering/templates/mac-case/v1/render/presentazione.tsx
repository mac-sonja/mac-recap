import { FormatRender } from "@/modules/rendering/templates/mac-case/v1/render/page";
import type { RenderInput } from "@/modules/rendering/templates/types";

/** mac-case v1 · Presentazione (16:9, 1920 frame): static pages, exported as PDF. */
export function Presentazione(input: RenderInput) {
  return <FormatRender formatId="presentazione_16_9" input={input} animatedTexts={false} />;
}
