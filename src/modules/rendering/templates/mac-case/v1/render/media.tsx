/* eslint-disable @next/next/no-img-element -- template output: plain <img> tags with signed URLs, the same markup for exports (renderToStaticMarkup) */
import type { CSSProperties, ReactNode } from "react";
import type { FormatId } from "@/modules/rendering/domain/formats";
import type { BoundValues, RenderAsset } from "@/modules/rendering/templates/types";

/** mac-case v1: what the renderers share — the render's context and media tags. */

/** What every element of one render reads. */
export interface RenderContext {
  formatId: FormatId;
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
  /** No animation; videos show their poster. */
  still: boolean;
  /** Video's text loop: the position of each animated element on its page (none when off). */
  vin: ReadonlyMap<string, number> | null;
}

/** Joins class names, skipping empty ones. */
export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** A custom property in a React style. */
export type Style = CSSProperties & Record<`--${string}`, string | number>;

/** The asset of `assetId`, or `undefined` when it is `null`, unknown or has no URL. */
export function assetOf(assetId: string | null, assets: Readonly<Record<string, RenderAsset>>): RenderAsset | undefined {
  if (assetId === null || !Object.hasOwn(assets, assetId)) return undefined;
  const asset = assets[assetId];
  return asset !== undefined && typeof asset.url === "string" && asset.url !== "" ? asset : undefined;
}

/**
 * The asset as this render shows it: `undefined` also for a still render of a video
 * without a poster (nothing to show, so no photo styling and an empty cell).
 */
export function shownAsset(assetId: string | null, ctx: Pick<RenderContext, "assets" | "still">): RenderAsset | undefined {
  const asset = assetOf(assetId, ctx.assets);
  return asset !== undefined && ctx.still && asset.kind === "video" && !asset.posterUrl ? undefined : asset;
}

/**
 * An asset's media tag: an image, a muted looping video, or (still) the video's poster.
 * `null` for a missing asset or a still video without a poster: never an `<img>` with an empty src.
 */
export function Media({ asset, still, style }: { asset: RenderAsset | undefined; still: boolean; style?: CSSProperties }): ReactNode {
  if (asset === undefined) return null;
  if (asset.kind === "video") {
    if (still) return asset.posterUrl ? <img src={asset.posterUrl} alt="" style={style} /> : null;
    return <video src={asset.url} poster={asset.posterUrl || undefined} muted autoPlay loop playsInline style={style} />;
  }
  return <img src={asset.url} alt="" style={style} />;
}

