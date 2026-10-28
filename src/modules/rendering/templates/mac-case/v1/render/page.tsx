import type { Background, Block, Page } from "@/modules/generation";
import type { FormatId } from "@/modules/rendering/domain/formats";
import { layouts } from "@/modules/rendering/templates/mac-case/v1/layouts";
import { stepKeyframesFor } from "@/modules/rendering/templates/mac-case/v1/render/animation";
import { StarDecoration } from "@/modules/rendering/templates/mac-case/v1/render/art";
import { BASE_CSS, textStyleCss, u } from "@/modules/rendering/templates/mac-case/v1/render/css";
import { Element, sequence } from "@/modules/rendering/templates/mac-case/v1/render/elements";
import { cx, Media, shownAsset, type RenderContext, type Style } from "@/modules/rendering/templates/mac-case/v1/render/media";
import type { GridArea, RenderInput } from "@/modules/rendering/templates/types";

/**
 * mac-case v1: a page and its bento grid of blocks, as the configurator mockup's
 * `renderPage` and `renderBlock` draw them, and the format renderer every format shares.
 */

const tracks = (sizes: readonly number[]) => sizes.map((v) => `minmax(0,${v}fr)`).join(" ");

/**
 * The grid: the page's own track sizes and its layout's areas. An unknown layout, or
 * fewer areas than blocks, puts the blocks in an even one-column grid instead.
 */
function gridOf(formatId: FormatId, page: Page): { template: string; areas: readonly (GridArea | undefined)[] } {
  const layout = layouts(formatId).find((l) => l.layoutId === page.grid.layoutId);
  if (layout === undefined || layout.areas.length < page.blocks.length) {
    const n = Math.max(1, page.blocks.length);
    return { template: `repeat(${n},minmax(0,1fr)) / minmax(0,1fr)`, areas: [] };
  }
  return { template: `${tracks(page.grid.rows)} / ${tracks(page.grid.cols)}`, areas: layout.areas };
}

const colourOf = (background: Background): string | undefined =>
  background.kind === "colour" ? background.value : background.kind === "transparent" ? "transparent" : undefined;

function BlockView({ block, area, ctx }: { block: Block; area: GridArea | undefined; ctx: RenderContext }) {
  const photo = block.background.kind === "image" ? shownAsset(block.background.assetId, ctx) : undefined;
  const only = block.elements.length === 1 ? block.elements[0] : undefined;
  // Riempi: an image (or video) alone in its block goes edge to edge.
  const bleed = only !== undefined && (only.type === "image" || only.type === "video") && only.fit === "fill";
  // Video's info block (room for Instagram's bar on top) gets more air between its lines.
  const vinfo = ctx.formatId === "video_9_16" && (block.paddingTop ?? 0) > 0;
  const style: Style = {};
  if (area !== undefined) style.gridArea = `${area[0]} / ${area[1]} / ${area[2]} / ${area[3]}`;
  const colour = colourOf(block.background);
  if (colour !== undefined) style.background = colour;
  if (!bleed && block.padding !== undefined) style.padding = u(block.padding);
  if (!bleed && block.paddingTop !== undefined) style.paddingTop = u(block.paddingTop);
  if (block.ink !== undefined) style.color = block.ink;
  return (
    <div className={cx("mr-blk", photo !== undefined && "mr-on-photo", bleed && "mr-bleed", vinfo && "mr-vinfo")} style={style} data-block-id={block.blockId}>
      {photo !== undefined ? (
        <div className="mr-bgimg">
          <Media asset={photo} still={ctx.still} />
        </div>
      ) : null}
      {block.elements.map((el) => (
        <Element key={el.elementId} el={el} ctx={ctx} />
      ))}
    </div>
  );
}

function PageView({ page, number, ctx }: { page: Page; number: number; ctx: RenderContext }) {
  const { template, areas } = gridOf(ctx.formatId, page);
  const pageBg = page.background.kind === "image" ? shownAsset(page.background.assetId, ctx) : undefined;
  const style: Style = { background: colourOf(page.background) ?? "transparent" };
  if (page.margin !== undefined) style["--pad"] = u(page.margin);
  return (
    <section
      className="mr-page"
      style={style}
      data-format={ctx.formatId}
      data-page-key={page.pageKey}
      data-role={page.role}
      data-section={page.section}
      data-page-number={number}
    >
      {pageBg !== undefined ? (
        <div className="mr-page-bg">
          <Media asset={pageBg} still={ctx.still} />
        </div>
      ) : null}
      {page.decoration === "star" ? <StarDecoration /> : null}
      <div className="mr-bento" style={{ gridTemplate: template }}>
        {page.blocks.map((block, i) => (
          <BlockView key={block.blockId} block={block} area={areas[i]} ctx={ctx} />
        ))}
      </div>
    </section>
  );
}

/**
 * One format's pages: its stylesheet, then one `<section>` per page. `animatedTexts`
 * turns on Video's text loop (never when the render is still).
 */
export function FormatRender({ formatId, input, animatedTexts }: { formatId: FormatId; input: RenderInput; animatedTexts: boolean }) {
  const options = input.options ?? {};
  const still = options.still === true;
  const start = Number.isFinite(options.startPage) ? Math.trunc(options.startPage as number) : 1;
  const css = [BASE_CSS, textStyleCss(formatId), still ? "" : stepKeyframesFor(input.pages, input.assets)].filter(Boolean).join("\n");
  const base = { formatId, assets: input.assets, values: input.values, still };
  return (
    <div className="mr-root" data-template="mac-case@1" data-format={formatId}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {input.pages.map((page, i) => (
        <PageView key={`${i}-${page.pageKey}`} page={page} number={start + i} ctx={{ ...base, vin: animatedTexts && !still ? sequence(page) : null }} />
      ))}
    </div>
  );
}
