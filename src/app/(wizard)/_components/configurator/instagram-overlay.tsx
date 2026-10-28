import type { ReactNode } from "react";
import { it } from "@/shared/i18n/it";
import { INSTAGRAM_CSS } from "./instagram-styles";

/** Which Instagram interface Anteprima draws over a Video page. */
export type InstagramView = "off" | "reel" | "story";

export const INSTAGRAM_VIEWS: readonly InstagramView[] = ["off", "reel", "story"];

/** The mockup's line icons (`IGI`). */
const ICONS = {
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  comment: <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" />,
  repost: (
    <>
      <path d="M17 3l3 3-3 3" />
      <path d="M4 11V9a3 3 0 0 1 3-3h13" />
      <path d="M7 21l-3-3 3-3" />
      <path d="M20 13v2a3 3 0 0 1-3 3H4" />
    </>
  ),
  send: (
    <>
      <path d="M21 4 3 11l7 3 3 7z" />
      <path d="M10 14l11-10" />
    </>
  ),
  menu: <path d="M5 9h14M7 15h10" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
} as const satisfies Record<string, ReactNode>;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

function Status() {
  return (
    <div className="ig-status">
      <b>{it.configurator.preview.instagram.clock}</b>
      <span className="ig-sys">
        <i />
        <i />
        <i />
        <em />
      </span>
    </div>
  );
}

function Account() {
  return (
    <>
      <span className="ig-av ig-mac">{it.configurator.preview.instagram.avatar}</span>
      <b>{it.configurator.preview.instagram.account}</b>
    </>
  );
}

/**
 * Instagram's own interface over a Video page in Anteprima (C34, mockup `igOverlay`):
 * a Reel (tabs, actions, account, **Segui** and the case name as the caption) or a
 * Story (progress, account, time, reply field). Friends' photos and the counts are
 * blanked. Drawn by the configurator over the rendered page, never by the renderer;
 * decorative only (`aria-hidden`, no pointer events). It must sit in a box as wide as
 * the page: it is its own size container, sized in the Video frame's units.
 */
export function InstagramOverlay({ view, caption }: { view: Exclude<InstagramView, "off">; caption: string }) {
  const copy = it.configurator.preview.instagram;
  return (
    <div aria-hidden="true" data-instagram={view} className="pointer-events-none absolute inset-0 z-10 @container">
      <style dangerouslySetInnerHTML={{ __html: INSTAGRAM_CSS }} />
      {view === "story" ? (
        <div className="ig">
          <Status />
          <div className="ig-progress">
            <i />
          </div>
          <div className="ig-head">
            <Account />
            <span className="ig-time">{copy.time}</span>
            <span className="ig-sp" />
            <Icon name="menu" />
            <Icon name="close" />
          </div>
          <div className="ig-reply">
            <span className="ig-msg">{copy.message}</span>
            <Icon name="heart" />
            <Icon name="send" />
          </div>
        </div>
      ) : (
        <div className="ig">
          <Status />
          <div className="ig-tabs">
            <b>{copy.forYou} ⌄</b>
            <span>{copy.friends}</span>
            <span className="ig-friends">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="ig-acts">
            {(["heart", "comment", "repost", "send", "menu"] as const).map((name) => (
              <div key={name}>
                <Icon name={name} />
                {(name === "comment" || name === "repost") && <small className="ig-n" />}
              </div>
            ))}
            <span className="ig-audio" />
          </div>
          <div className="ig-cap">
            <div className="ig-user">
              <Account />
              <span className="ig-follow">{copy.follow}</span>
            </div>
            <div className="ig-text">{caption}</div>
          </div>
        </div>
      )}
    </div>
  );
}
