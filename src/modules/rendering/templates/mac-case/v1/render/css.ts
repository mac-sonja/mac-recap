import type { TextStyle } from "@/modules/generation";
import type { FormatId } from "@/modules/rendering/domain/formats";
import { textStyles } from "@/modules/rendering/templates/mac-case/v1/styles";

/**
 * mac-case v1: the renderers' stylesheet, from the configurator mockup's CSS (`.page`,
 * `.bento`, `.slot.blk`, `.it-*`, `.t-*`, `.tags`, `.brand`, `.an-*`, `.vin`). Every size
 * is in units of the Figma frame width: a page is a size container and
 * `1u = 100cqw / frame`. Class names are prefixed `mr-` and never come from the tool's
 * UI (no tokens, no Tailwind).
 */

/** The Figma frame width of each format (Carosello is drawn on 1000 px and scaled to 1080). */
export const FRAME: Readonly<Record<FormatId, number>> = Object.freeze({
  presentazione_16_9: 1920,
  carosello_1_1: 1000,
  video_9_16: 1080,
});

/** The page margin of each format, in u (a page's own `margin` overrides it). */
export const PAGE_MARGIN: Readonly<Record<FormatId, number>> = Object.freeze({
  presentazione_16_9: 64,
  carosello_1_1: 24,
  video_9_16: 24,
});
export const GUTTER = 24;
export const BLOCK_PADDING = 28;

/** `n` frame units. */
export const u = (n: number) => `calc(var(--u) * ${n})`;

const P = ".mr-page";
const PRES = `${P}[data-format="presentazione_16_9"]`;
const CARO = `${P}[data-format="carosello_1_1"]`;
const VIDEO = `${P}[data-format="video_9_16"]`;

/** Everything that doesn't depend on the format's text sizes. */
export const BASE_CSS = [
  // Page: a size container; the bento grid sits inside the margin.
  `${P}{position:relative;display:block;width:100%;overflow:hidden;container-type:inline-size;box-sizing:border-box;color:#012234;font-family:Inter,sans-serif;letter-spacing:0;--gut:${u(GUTTER)};--bpad:${u(BLOCK_PADDING)}}`,
  `${P} *,${P} *::before,${P} *::after{box-sizing:border-box}`,
  `${PRES}{aspect-ratio:16/9;--u:calc(100cqw / ${FRAME.presentazione_16_9});--pad:${u(PAGE_MARGIN.presentazione_16_9)}}`,
  `${CARO}{aspect-ratio:1/1;--u:calc(100cqw / ${FRAME.carosello_1_1});--pad:${u(PAGE_MARGIN.carosello_1_1)}}`,
  `${VIDEO}{aspect-ratio:9/16;--u:calc(100cqw / ${FRAME.video_9_16});--pad:${u(PAGE_MARGIN.video_9_16)}}`,
  `.mr-page-bg{position:absolute;inset:0}`,
  `.mr-page-bg>img,.mr-page-bg>video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}`,
  `.mr-page-deco{position:absolute;pointer-events:none}`,
  `.mr-page-deco>svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}`,
  `.mr-bento{position:absolute;inset:var(--pad);display:grid;gap:var(--gut)}`,
  // Block: elements stacked top to bottom.
  `.mr-blk{position:relative;display:flex;flex-direction:column;gap:${u(12)};min-width:0;min-height:0;overflow:hidden;border-radius:${u(20)};padding:var(--bpad);background:#EDEDF0}`,
  `.mr-blk.mr-bleed{padding:0}`,
  `.mr-bgimg{position:absolute;inset:0;z-index:0}`,
  `.mr-bgimg>img,.mr-bgimg>video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}`,
  `.mr-bgimg::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgb(102 102 102 / 0),rgb(0 0 0 / .5))}`,
  `.mr-blk>*:not(.mr-bgimg){position:relative;z-index:1}`,
  `.mr-on-photo{color:#FFFFFF}`,
  // Texts wrap to the block's width and grow in height; only a number in a row stays on one line.
  `.mr-txt{min-width:0;max-width:100%;margin:0;overflow-wrap:break-word}`,
  `.mr-t-text{white-space:pre-line}`,
  `.mr-al-centre{text-align:center}.mr-al-right{text-align:right}`,
  `.mr-cols-2{columns:2;column-gap:${u(40)}}`,
  `.mr-row .mr-t-num{white-space:nowrap}`,
  // Testi group: top grows and pushes what follows down; centre; bottom; split after `splitAt`.
  `.mr-grp{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;min-width:0;gap:${u(12)}}`,
  `.mr-grp-top{justify-content:flex-start}.mr-grp-centre{justify-content:center}.mr-grp-bottom{justify-content:flex-end}`,
  `.mr-grp-split>.mr-push{margin-bottom:auto}`,
  `.mr-row>.mr-grp{flex:1;gap:${u(6)}}`,
  // Row: the first item at the start, the last at the end.
  `.mr-row{display:flex;justify-content:space-between;align-items:center;gap:${u(20)};min-width:0}`,
  `.mr-row.mr-wide{gap:${u(110)}}`,
  `.mr-row.mr-atop{align-items:flex-start}`,
  // A result row: what it measures, then the number.
  `.mr-kpirow>.mr-t-text{width:${u(120)};flex-shrink:0;font-weight:500;line-height:1.1}`,
  `${VIDEO} .mr-kpirow>.mr-t-text{width:auto;flex:1 1 0;max-width:52%;line-height:1.15}`,
  // Divider: currentColor at 20 %, or its own colour (the results' lines).
  `.mr-hr{flex-shrink:0;height:1px;background:currentColor;opacity:.2;margin:${u(16)} 0}`,
  `.mr-hr.mr-hr-colour{opacity:1;margin:${u(12)} 0 ${u(-4)}}`,
  `${CARO} .mr-hr.mr-hr-colour{margin-top:${u(28)}}`,
  `${VIDEO} .mr-hr.mr-hr-colour{margin:${u(24)} 0 ${u(4)}}`,
  // Video's info block (Intro and Risultati): more air between the client's lines.
  `.mr-blk.mr-vinfo{gap:${u(24)}}`,
  `.mr-vinfo>.mr-row:first-of-type{margin-bottom:${u(40)}}`,
  `.mr-vinfo .mr-grp{gap:${u(12)}}`,
  `.mr-vinfo>.mr-t-sub{margin-top:${u(4)}}`,
  `.mr-vinfo>.mr-hr{margin:${u(20)} 0}`,
  // Media: Riempi cover, Adatta contain, Ritaglia cover positioned and zoomed.
  `.mr-img{flex:1 1 0;min-height:${u(40)};position:relative;overflow:hidden;border-radius:${u(12)}}`,
  `.mr-bleed .mr-img{border-radius:0}`,
  `.mr-img>img,.mr-img>video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}`,
  `.mr-img[data-fit="fit"]>img,.mr-img[data-fit="fit"]>video{object-fit:contain}`,
  // Services as tags.
  `.mr-tags{display:flex;flex-wrap:wrap;gap:${u(6)};align-content:center}`,
  `.mr-row .mr-tags{justify-content:flex-end}`,
  `.mr-tag{border-radius:999px;padding:${u(7)} ${u(14)};font-weight:500;font-size:${u(14)};line-height:${u(18.2)};white-space:nowrap;background:#012234;color:#EFEFEF}`,
  `.mr-on-photo .mr-tag{background:rgb(255 255 255 / .15);color:#FFFFFF}`,
  // Logos: the client's, a divider, MAC's; white on a photo.
  `.mr-brand{display:flex;align-items:center;gap:${u(20)};flex-shrink:0}`,
  `.mr-clogo{height:${u(40)};width:auto;max-width:${u(180)};object-fit:contain;display:block}`,
  `.mr-on-photo .mr-clogo{filter:brightness(0) invert(1)}`,
  `.mr-dv{width:1px;height:${u(48)};display:block;background:#012234}`,
  `.mr-on-photo .mr-dv{background:#FFFFFF}`,
  `.mr-mac{width:${u(89)};height:${u(28.914)};display:block;color:#012234}`,
  `.mr-on-photo .mr-mac{color:#FFFFFF}`,
  // Animazione: 9:16 cards; Adatta keeps air around them, Riempi lets them fill; size scales them.
  `.mr-anim{flex:1 1 0;min-height:${u(80)};position:relative;overflow:hidden}`,
  `.mr-an{position:absolute;inset:0;overflow:hidden;container-type:size;transform:scale(var(--as,1));transform-origin:center}`,
  `.mr-ac{flex-shrink:0;border-radius:${u(8)};overflow:hidden;background:linear-gradient(135deg,#efeee9,#d6d5cf);aspect-ratio:9/16}`,
  `.mr-ac>img,.mr-ac>video{width:100%;height:100%;object-fit:cover;display:block}`,
  `.mr-anim[data-fit="fit"] .mr-ac>img,.mr-anim[data-fit="fit"] .mr-ac>video{object-fit:contain}`,
  `.mr-trk{display:flex;flex-shrink:0}`,
  `.mr-an-c01{display:flex;justify-content:center}`,
  `.mr-an-c01 .mr-trk{flex-direction:column;gap:4cqh;padding-bottom:4cqh}`,
  `.mr-an-c01 .mr-ac{height:min(68cqh,calc(60cqw * 16 / 9));width:auto}`,
  `.mr-an-c03{display:flex;flex-direction:column;align-items:center;--ch:min(76cqh,calc(54cqw * 16 / 9))}`,
  `.mr-an-c03 .mr-trk{flex-direction:column;align-items:center;gap:6cqh;margin-top:calc(50cqh - var(--ch) / 2)}`,
  `.mr-an-c03 .mr-ac{height:var(--ch);width:auto}`,
  `.mr-an-c04{display:flex;align-items:center;--cw:min(34cqw,calc(92cqh * 9 / 16))}`,
  `.mr-an-c04 .mr-trk{gap:6cqw;margin-left:calc(50cqw - var(--cw) / 2)}`,
  `.mr-an-c04 .mr-ac{width:var(--cw);height:auto}`,
  `.mr-an-w02 .mr-ring{position:absolute;inset:0}`,
  `.mr-an-w02 .mr-ac{position:absolute;left:50%;top:50%;width:16cqmin;height:auto;transform:translate(-50%,-50%) rotate(var(--a)) translateY(-31cqmin)}`,
  // Video: bigger cards in every animation.
  `${VIDEO} .mr-an-c04{--cw:min(58cqw,calc(84cqh * 9 / 16))}`,
  `${VIDEO} .mr-an-c03{--ch:min(80cqh,calc(66cqw * 16 / 9))}`,
  `${VIDEO} .mr-an-c01 .mr-ac{height:min(78cqh,calc(70cqw * 16 / 9))}`,
  `${VIDEO} .mr-an-w02 .mr-ac{width:20cqmin}`,
  `.mr-anim[data-fit="fill"] .mr-an-c04{--cw:min(70cqw,calc(100cqh * 9 / 16))}`,
  `.mr-anim[data-fit="fill"] .mr-an-c03{--ch:min(100cqh,calc(80cqw * 16 / 9))}`,
  `.mr-anim[data-fit="fill"] .mr-an-c01 .mr-ac{height:min(100cqh,calc(80cqw * 16 / 9))}`,
  `.mr-anim[data-fit="fill"] .mr-an-w02 .mr-ac{width:22cqmin}`,
  `@keyframes mr-an-y{to{transform:translateY(-50%)}}`,
  `@keyframes mr-an-spin{to{transform:rotate(360deg)}}`,
  // Video: texts come in one after the other, on a loop.
  `@keyframes mr-vtext{0%{opacity:0;transform:translateY(${u(28)})}14%,100%{opacity:1;transform:none}}`,
  `.mr-vin{animation:mr-vtext 7s cubic-bezier(.22,1,.36,1) infinite both;animation-delay:calc(var(--i) * 140ms)}`,
  // Reduced motion stops every animation.
  `@media (prefers-reduced-motion:reduce){.mr-vin{animation:none}.mr-an *{animation:none!important}}`,
].join("\n");

/**
 * The seven text styles at the format's sizes (the template's styles, not the tool's),
 * scoped to the format's pages so two formats rendered in one document keep their own
 * sizes. `:where()` keeps the specificity of a single class, so the row and Video rules
 * above still override them.
 */
export function textStyleCss(formatId: FormatId): string {
  const styles = textStyles(formatId);
  return (Object.keys(styles) as TextStyle[]).map((style) => {
    const s = styles[style];
    const lineHeight = s.lineHeight.unit === "em" ? String(s.lineHeight.value) : u(s.lineHeight.value);
    return `:where(${P}[data-format="${formatId}"]) .mr-t-${style}{font-size:${u(s.size)};font-weight:${s.weight};line-height:${lineHeight};letter-spacing:${s.letterSpacing}em${s.uppercase ? ";text-transform:uppercase" : ""}}`;
  }).join("\n");
}

/** The name of the stepped slide of `n` cards along `axis` (Carousel 03: y; Carousel 04: x). */
export const stepName = (axis: "x" | "y", n: number) => `mr-s2${axis}-${n}`;

/**
 * Stepped slide: hold on each card, then move one step; the copy of the first card at
 * the end makes the loop seamless. One step is a 9:16 card plus the gap.
 */
export function stepKeyframes(axis: "x" | "y", n: number): string {
  const step = axis === "x" ? "(var(--cw) + 6cqw)" : "(var(--ch) + 6cqh)";
  const at = (i: number) => `transform:translate${axis.toUpperCase()}(calc(-1 * ${i} * ${step}))`;
  let frames = "";
  for (let i = 0; i < n; i++) {
    const a = (i * 100) / n;
    const b = a + 70 / n;
    frames += `${a.toFixed(2)}%,${b.toFixed(2)}%{${at(i)};animation-timing-function:cubic-bezier(.65,0,.35,1)}`;
  }
  return `@keyframes ${stepName(axis, n)}{${frames}100%{${at(n)}}}`;
}
