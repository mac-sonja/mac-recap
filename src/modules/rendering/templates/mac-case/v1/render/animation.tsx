import type { AnimationElement, AnimationId, Page } from "@/modules/generation";
import { stepKeyframes, stepName } from "@/modules/rendering/templates/mac-case/v1/render/css";
import { assetOf, cx, Media, type RenderContext, type Style } from "@/modules/rendering/templates/mac-case/v1/render/media";
import type { RenderAsset } from "@/modules/rendering/templates/types";

/**
 * mac-case v1: Animazione (C35), as the configurator mockup's `animHTML`: Carousel 01
 * (a vertical loop), Carousel 03 (vertical steps), Carousel 04 (horizontal steps) and
 * Wheel 02 (a turning ring). Every card is 9:16; with no media, three empty cards.
 */

/** With no media yet, the animation shows this many empty cards. */
export const EMPTY_CARDS = 3;

const SHORT: Readonly<Record<AnimationId, "c01" | "c03" | "c04" | "w02">> = {
  carousel_01: "c01",
  carousel_03: "c03",
  carousel_04: "c04",
  wheel_02: "w02",
};

/** The animation's cards: its known media in order, or three empty ones. */
export function cardsOf(el: AnimationElement, assets: Readonly<Record<string, RenderAsset>>): (RenderAsset | undefined)[] {
  const media = el.assetIds.map((id) => assetOf(id, assets)).filter((a): a is RenderAsset => a !== undefined);
  return media.length > 0 ? media : Array.from({ length: EMPTY_CARDS }, () => undefined);
}

/** The stepped slides (Carousel 03 and 04) the pages need: their keyframes, once each. */
export function stepKeyframesFor(pages: readonly Page[], assets: Readonly<Record<string, RenderAsset>>): string {
  const wanted = new Set<string>();
  const out: string[] = [];
  for (const page of pages) {
    for (const block of page.blocks) {
      for (const el of block.elements) {
        if (el.type !== "animation" || (el.animation !== "carousel_03" && el.animation !== "carousel_04")) continue;
        const n = cardsOf(el, assets).length;
        const axis = el.animation === "carousel_04" ? "x" : "y";
        if (n < 2 || wanted.has(stepName(axis, n))) continue;
        wanted.add(stepName(axis, n));
        out.push(stepKeyframes(axis, n));
      }
    }
  }
  return out.join("\n");
}

/** A card; a loop copy (the seamless loop's repeat) is hidden from assistive tech. */
function Card({ asset, ctx, style, copy = false }: { asset: RenderAsset | undefined; ctx: RenderContext; style?: Style; copy?: boolean }) {
  return (
    <div className={copy ? "mr-ac mr-ac-copy" : "mr-ac"} style={style} aria-hidden={copy || undefined}>
      <Media asset={asset} still={ctx.still} />
    </div>
  );
}

export function Animation({ el, ctx }: { el: AnimationElement; ctx: RenderContext }) {
  const list = cardsOf(el, ctx.assets);
  const n = list.length;
  const type = SHORT[el.animation];
  const moving = !ctx.still && n > 1;
  const cards = (from: number) => list.map((asset, i) => <Card key={from + i} asset={asset} ctx={ctx} copy={from > 0} />);
  let body;
  if (type === "w02") {
    body = (
      <div className="mr-ring" style={moving ? { animation: `mr-an-spin ${Math.max(n, 4) * 3}s linear infinite` } : undefined}>
        {list.map((asset, i) => (
          <Card key={i} asset={asset} ctx={ctx} style={{ "--a": `${(i * 360) / n}deg` }} />
        ))}
      </div>
    );
  } else if (type === "c01") {
    body = (
      <div className="mr-trk" style={moving ? { animation: `mr-an-y ${n * 2.5}s linear infinite` } : undefined}>
        {cards(0)}
        {n > 1 ? cards(n) : null}
      </div>
    );
  } else {
    const axis = type === "c04" ? "x" : "y";
    body = (
      <div className="mr-trk" style={moving ? { animation: `${stepName(axis, n)} ${(n * 2.2).toFixed(1)}s infinite` } : undefined}>
        {cards(0)}
        {n > 1 ? <Card key={n} asset={list[0]} ctx={ctx} copy /> : null}
      </div>
    );
  }
  const style: Style = { "--as": (el.size ?? 100) / 100 };
  return (
    <div className="mr-anim" data-fit={el.fit} data-animation={el.animation} data-element-id={el.elementId} style={style}>
      <div className={cx("mr-an", `mr-an-${type}`)}>{body}</div>
    </div>
  );
}
