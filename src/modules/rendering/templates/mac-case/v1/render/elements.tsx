/* eslint-disable @next/next/no-img-element -- template output: plain <img> tags with signed URLs, the same markup for exports (renderToStaticMarkup) */
import type { CSSProperties, ReactNode } from "react";
import type { Binding, Crop, DocumentElement, Page, RowElement, TextElement, TextGroupElement } from "@/modules/generation";
import { Animation } from "@/modules/rendering/templates/mac-case/v1/render/animation";
import { MacLogo } from "@/modules/rendering/templates/mac-case/v1/render/art";
import { u } from "@/modules/rendering/templates/mac-case/v1/render/css";
import { cx, Media, shownAsset, type RenderContext, type Style } from "@/modules/rendering/templates/mac-case/v1/render/media";
import type { BoundValues } from "@/modules/rendering/templates/types";

/**
 * mac-case v1: every v2 element, drawn as the configurator mockup's `renderItem` does.
 * Pure: everything comes from the props.
 */

/** Ritaglia: cover, positioned by `crop.x`/`crop.y` and scaled by its zoom. */
const cropStyle = (crop: Crop | undefined): CSSProperties | undefined => {
  if (crop === undefined) return { objectPosition: "50% 50%" };
  const at = `${crop.x * 100}% ${crop.y * 100}%`;
  return { objectPosition: at, transformOrigin: at, transform: `scale(${crop.zoom})` };
};

// ---------------------------------------------------------------------------
// Bound values
// ---------------------------------------------------------------------------

/** The client's words between « », as the template shows them (quotes the text already has are dropped). */
const quoted = (quote: string) => {
  const bare = quote.trim().replace(/^[“«"]+|[”»"]+$/g, "");
  return bare === "" ? "" : `«${bare}»`;
};

/** The current value of a bound field; a missing one is empty text. */
export function boundValue(binding: Binding, values: BoundValues): string {
  const record = binding.record === "client" ? values.client : values.case;
  const row = binding.index === undefined ? undefined : record?.results?.[binding.index];
  switch (binding.field) {
    case "name":
      return values.client?.name ?? "";
    case "sector":
      return values.client?.sector ?? "";
    case "description":
      return values.client?.description ?? "";
    case "year":
      return values.case?.year == null ? "" : String(values.case.year);
    case "resultLabel":
      return row?.label ?? "";
    case "resultValue":
      return row?.value ?? "";
    case "testimonialQuote":
      return quoted(record?.testimonial?.quote ?? "");
    case "testimonialAuthor":
      return record?.testimonial?.author ?? "";
  }
}

/** A text's words: its own, its binding's value, or its bindings' values joined by " · " (empty ones left out). */
export function textOf(el: TextElement, values: BoundValues): string {
  if (el.text !== undefined) return el.text;
  if (el.binding !== undefined) return boundValue(el.binding, values);
  return (el.bindings ?? [])
    .map((b) => boundValue(b, values))
    .filter((v) => v !== "")
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Video's text loop
// ---------------------------------------------------------------------------

/** Texts, tags, logos and lines, in document order: the elements that come in one after the other. */
const SEQUENCED = new Set<DocumentElement["type"]>(["text", "services", "logos", "divider"]);

/** Each sequenced element's position on its page (the mockup's `--i`). */
export function sequence(page: Page): Map<string, number> {
  const order = new Map<string, number>();
  const walk = (elements: readonly DocumentElement[]) => {
    for (const el of elements) {
      if (SEQUENCED.has(el.type)) order.set(el.elementId, order.size);
      if (el.type === "text_group" || el.type === "row") walk(el.items);
    }
  };
  for (const block of page.blocks) walk(block.elements);
  return order;
}

/** The text-loop class and its delay for one element, when the loop is on. */
const vinOf = (elementId: string, ctx: RenderContext): { className?: string; style?: Style } => {
  const i = ctx.vin?.get(elementId);
  return i === undefined ? {} : { className: "mr-vin", style: { "--i": i } };
};

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

function Text({ el, ctx, extra }: { el: TextElement; ctx: RenderContext; extra?: string }) {
  const vin = vinOf(el.elementId, ctx);
  const style: Style = { ...vin.style };
  if (el.colour !== undefined) style.color = el.colour;
  if (el.size !== undefined) style.fontSize = u(el.size);
  return (
    <div
      className={cx("mr-txt", `mr-t-${el.style}`, el.align !== undefined && el.align !== "left" && `mr-al-${el.align}`, el.columns === 2 && "mr-cols-2", extra, vin.className)}
      style={style}
      data-element-id={el.elementId}
    >
      {textOf(el, ctx.values)}
    </div>
  );
}

function TextGroup({ el, ctx }: { el: TextGroupElement; ctx: RenderContext }) {
  const pushAt = el.align === "split" ? (el.splitAt ?? 1) - 1 : -1;
  return (
    <div className={cx("mr-grp", `mr-grp-${el.align}`)} data-element-id={el.elementId}>
      {el.items.map((item, i) => (
        <Text key={item.elementId} el={item} ctx={ctx} extra={i === pushAt ? "mr-push" : undefined} />
      ))}
    </div>
  );
}

function Row({ el, ctx }: { el: RowElement; ctx: RenderContext }) {
  // A row holding a number is a result row: what it measures, then the number.
  const kpi = el.items.some((item) => item.type === "text" && item.style === "num");
  return (
    <div className={cx("mr-row", el.align === "top" && "mr-atop", el.wide === true && "mr-wide", kpi && "mr-kpirow")} data-element-id={el.elementId}>
      {el.items.map((item) => (
        <Element key={item.elementId} el={item} ctx={ctx} />
      ))}
    </div>
  );
}

function Services({ elementId, ctx }: { elementId: string; ctx: RenderContext }) {
  const vin = vinOf(elementId, ctx);
  return (
    <div className={cx("mr-tags", vin.className)} style={vin.style} data-element-id={elementId}>
      {(ctx.values.case?.services ?? []).map((service, i) => (
        <span key={`${i}-${service}`} className="mr-tag">
          {service}
        </span>
      ))}
    </div>
  );
}

/** The client's logo (when it has one), a divider, MAC's logo. */
function Logos({ elementId, ctx }: { elementId: string; ctx: RenderContext }) {
  const vin = vinOf(elementId, ctx);
  const logoUrl = ctx.values.client?.logoUrl;
  return (
    <div className={cx("mr-brand", vin.className)} style={vin.style} data-element-id={elementId}>
      {logoUrl ? (
        <>
          <img className="mr-clogo" src={logoUrl} alt={ctx.values.client?.name ?? ""} />
          <span className="mr-dv" aria-hidden="true" />
        </>
      ) : null}
      <MacLogo />
    </div>
  );
}

function Divider({ elementId, colour, ctx }: { elementId: string; colour: string | undefined; ctx: RenderContext }) {
  const vin = vinOf(elementId, ctx);
  return (
    <div
      className={cx("mr-hr", colour !== undefined && "mr-hr-colour", vin.className)}
      style={colour === undefined ? vin.style : { ...vin.style, background: colour }}
      data-element-id={elementId}
    />
  );
}

function MediaCell({ el, ctx }: { el: Extract<DocumentElement, { type: "image" | "video" }>; ctx: RenderContext }) {
  const asset = shownAsset(el.assetId, ctx);
  return (
    <div className="mr-img" data-fit={el.fit} data-empty={asset === undefined ? "" : undefined} data-element-id={el.elementId}>
      <Media asset={asset} still={ctx.still} style={el.fit === "crop" ? cropStyle(el.crop) : undefined} />
    </div>
  );
}

/** One element of a block (or of a row). */
export function Element({ el, ctx }: { el: DocumentElement; ctx: RenderContext }): ReactNode {
  switch (el.type) {
    case "text":
      return <Text el={el} ctx={ctx} />;
    case "text_group":
      return <TextGroup el={el} ctx={ctx} />;
    case "row":
      return <Row el={el} ctx={ctx} />;
    case "image":
    case "video":
      return <MediaCell el={el} ctx={ctx} />;
    case "animation":
      return <Animation el={el} ctx={ctx} />;
    case "services":
      return <Services elementId={el.elementId} ctx={ctx} />;
    case "logos":
      return <Logos elementId={el.elementId} ctx={ctx} />;
    case "divider":
      return <Divider elementId={el.elementId} colour={el.colour} ctx={ctx} />;
  }
}
