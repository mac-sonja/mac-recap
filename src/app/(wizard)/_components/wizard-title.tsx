"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fill, it } from "@/shared/i18n/it";

/** Sets the live title; `null` hands the title back to the page's. */
type SetLiveTitle = (title: string | null) => void;

const LiveTitleContext = createContext<{ live: string | null; setLive: SetLiveTitle } | null>(null);

/**
 * Holds the wizard's live title (Story 2.18): a step may replace the title the
 * page rendered (`useLiveWizardTitle`). Without a live title, the page's title shows.
 */
export function WizardTitleProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<string | null>(null);
  const value = useMemo(() => ({ live, setLive }), [live]);
  return <LiveTitleContext.Provider value={value}>{children}</LiveTitleContext.Provider>;
}

/**
 * The wizard's large title text: the live title when a step sets one (an empty one
 * reads `fallback`), else the page's `title`.
 */
export function WizardTitleText({ title, fallback }: { title: string; fallback: string }) {
  const context = useContext(LiveTitleContext);
  const live = context?.live ?? null;
  return <>{live === null ? title : live === "" ? fallback : live}</>;
}

/**
 * Makes `name` the wizard's live title (the case wizard's Dettagli step): an empty
 * name reads the eyebrow (*Nuova case history*). The browser tab follows, as
 * "{title} · MAC Recap"; on unmount the page's title and the tab title come back.
 * Outside a `WizardTitleProvider` (a test) it does nothing.
 */
export function useLiveWizardTitle(name: string) {
  const context = useContext(LiveTitleContext);
  const setLive = context?.setLive;
  const original = useRef<string | null>(null);

  useEffect(() => {
    if (setLive === undefined) return;
    setLive(name);
    if (original.current === null) original.current = document.title;
    document.title = fill(it.wizard.tabTitle, { title: name === "" ? it.wizard.eyebrow : name, app: it.app.name });
  }, [name, setLive]);

  useEffect(() => {
    if (setLive === undefined) return;
    return () => {
      setLive(null);
      if (original.current !== null) document.title = original.current;
    };
  }, [setLive]);
}
