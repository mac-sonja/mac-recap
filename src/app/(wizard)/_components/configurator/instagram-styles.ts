import { getFormat } from "@/modules/rendering";

/**
 * The Instagram overlay's stylesheet (mockup `configurator.html`, `.ig*`). These are
 * Instagram's own interface colours drawn over a published page, not the tool's UI, so
 * they stay out of the `globals.css` tokens, like the template's colours stay in the
 * renderer. Sizes are in the Video frame's units: the overlay sits in a size container
 * as wide as the page and `1u = 100cqw / width` (the registry's Video width, 1080), as
 * the renderer's `--u`.
 */
export const VIDEO_FRAME_WIDTH = getFormat("video_9_16").pixelSize.width;

const u = (n: number) => `calc(var(--u) * ${n})`;

export const INSTAGRAM_CSS = [
  `.ig{--u:calc(100cqw / ${VIDEO_FRAME_WIDTH});position:absolute;inset:0;pointer-events:none;color:#fff;font-family:Inter,sans-serif;font-size:${u(30)};line-height:1.2}`,
  `.ig svg{width:${u(60)};height:${u(60)};display:block;flex-shrink:0;filter:drop-shadow(0 1px 3px rgb(0 0 0 / .35))}`,
  `.ig b{font-weight:600}`,
  `.ig-sp{flex:1}`,
  `.ig-status{position:absolute;left:${u(80)};right:${u(70)};top:${u(34)};display:flex;justify-content:space-between;align-items:center;font-size:${u(34)}}`,
  `.ig-sys{display:flex;gap:${u(8)};align-items:flex-end}`,
  `.ig-sys i{width:${u(7)};background:#fff;border-radius:2px}.ig-sys i:nth-child(1){height:${u(12)}}.ig-sys i:nth-child(2){height:${u(18)}}.ig-sys i:nth-child(3){height:${u(24)}}`,
  `.ig-sys em{width:${u(50)};height:${u(24)};border:${u(3)} solid #fff;border-radius:${u(7)};margin-left:${u(10)}}`,
  `.ig-tabs{position:absolute;left:0;right:0;top:${u(130)};display:flex;justify-content:center;align-items:center;gap:${u(30)};font-size:${u(46)};text-shadow:0 1px 3px rgb(0 0 0 / .4)}`,
  `.ig-tabs span{opacity:.6;font-weight:600}`,
  `.ig-friends{display:flex}.ig-friends i{width:${u(44)};height:${u(44)};border-radius:50%;background:#9a9aa2;box-shadow:0 0 0 ${u(3)} #fff;margin-left:${u(-10)}}`,
  `.ig-acts{position:absolute;right:${u(34)};bottom:${u(150)};display:flex;flex-direction:column;gap:${u(40)};align-items:center}`,
  `.ig-acts>div{display:flex;flex-direction:column;align-items:center}`,
  `.ig-n{display:block;width:${u(56)};height:${u(18)};border-radius:${u(9)};background:rgb(255 255 255 / .45);margin-top:${u(12)}}`,
  `.ig-audio{width:${u(62)};height:${u(62)};border-radius:${u(12)};background:#9a9aa2;box-shadow:0 0 0 ${u(3)} #fff}`,
  `.ig-cap{position:absolute;left:${u(40)};right:${u(170)};bottom:${u(70)};display:flex;flex-direction:column;gap:${u(22)};text-shadow:0 1px 3px rgb(0 0 0 / .4)}`,
  `.ig-user,.ig-head{display:flex;align-items:center;gap:${u(20)}}`,
  `.ig-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.9}`,
  `.ig-av{width:${u(90)};height:${u(90)};border-radius:50%;flex-shrink:0}`,
  `.ig-mac{background:#012234;color:#defe56;display:grid;place-items:center;font-weight:700;font-size:${u(26)};box-shadow:0 0 0 ${u(4)} #fff}`,
  `.ig-follow{border:${u(2)} solid rgb(255 255 255 / .7);border-radius:${u(14)};padding:${u(6)} ${u(20)}}`,
  `.ig-progress{position:absolute;left:${u(20)};right:${u(20)};top:${u(120)};height:${u(5)};border-radius:3px;background:rgb(255 255 255 / .4)}`,
  `.ig-progress i{display:block;width:10%;height:100%;border-radius:3px;background:#fff}`,
  `.ig-head{position:absolute;left:${u(30)};right:${u(30)};top:${u(150)};font-size:${u(34)}}`,
  `.ig-head .ig-av{width:${u(76)};height:${u(76)}}`,
  `.ig-time{opacity:.8}`,
  `.ig-reply{position:absolute;left:${u(40)};right:${u(40)};bottom:${u(60)};display:flex;align-items:center;gap:${u(40)}}`,
  `.ig-msg{flex:1;border:${u(2)} solid rgb(255 255 255 / .6);border-radius:999px;padding:${u(26)} ${u(46)}}`,
].join("\n");
