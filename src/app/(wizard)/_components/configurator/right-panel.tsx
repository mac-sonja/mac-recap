"use client";

import { LayoutGrid, List, PanelRight, Search } from "lucide-react";
import { memo, useId, useMemo, useState, type Ref } from "react";
import { SEARCH_FIELD, SEARCH_ICON } from "@/app/_components/field-styles";
import type { Page, PageSection } from "@/modules/generation";
import type { ListedAsset } from "@/modules/material";
import { renderFormat, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { pageAssetIds, type MediaUploadRules } from "./media-files";
import { MediaTab } from "./media-tab";
import type { MediaUpload } from "./use-media-upload";
import { ASPECT, EYEBROW, ICON_BUTTON, SEG, SEG_BUTTON } from "./styles";

/**
 * The pages in order, cut into runs of one section each, as the canvas groups them: a page
 * moved into another section's place (Story 4.13) keeps its own label, where it now is.
 */
function runsOf<T extends { page: Page }>(items: readonly T[]): { section: PageSection; items: T[] }[] {
  const runs: { section: PageSection; items: T[] }[] = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (last !== undefined && last.section === item.page.section) last.items.push(item);
    else runs.push({ section: item.page.section, items: [item] });
  }
  return runs;
}

/** A Pagine thumbnail's drag data type (Story 4.13): its page key, in a type the canvas and the Media tab ignore. */
const PAGE_DRAG_TYPE = "application/x-mac-page";

/** The right panel's tabs. */
export type RightTab = "pages" | "media";

export interface RightPanelProps {
  /** Hidden from its own bar; kept mounted so its state survives. */
  hidden?: boolean;
  formatId: FormatId;
  template: string;
  pages: readonly Page[];
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
  /** The selected page, marked `aria-current`. */
  currentPageKey: string | undefined;
  onSelectPage: (pageKey: string) => void;
  /** A thumbnail dropped on another (Story 4.13); undefined: thumbnails don't drag. */
  onMovePage?: (from: string, to: string) => void;
  /** The case's images and videos, oldest first, as last listed (Story 4.5a; the configurator owns the list). */
  media: readonly ListedAsset[];
  /** The client's images and videos, in position order: the Media tab's "Del cliente" group (Story 4.5c-2). */
  clientMedia?: readonly ListedAsset[];
  mediaRules: MediaUploadRules;
  /** The case's one upload path (Story 4.5c-3: shared with the Animazione dialog). */
  mediaUpload: MediaUpload;
  /** A Media tile's star. */
  onStarMedia: (file: ListedAsset) => void;
  /** The tab shown; the configurator owns it, so **Sostituisci dai Media** can open Media (Story 4.5b). */
  tab: RightTab;
  onTab: (tab: RightTab) => void;
  /** The Media tab's button, focused when the left panel opens it. */
  mediaTabRef?: Ref<HTMLButtonElement>;
  /** A Media tile clicked (Story 4.5b); undefined while nothing can be placed. */
  onPickMedia?: (file: ListedAsset) => void;
  onHide: () => void;
  hideRef: Ref<HTMLButtonElement>;
}

/**
 * A page's live thumbnail: the page itself, drawn by the format's renderer, still
 * (no animation, videos show their poster). Memoised: only a changed page redraws.
 */
const Thumbnail = memo(function Thumbnail({
  formatId,
  template,
  page,
  number,
  assets,
  values,
}: {
  formatId: FormatId;
  template: string;
  page: Page;
  number: number;
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
}) {
  return (
    <span aria-hidden="true" className={cn("pointer-events-none block w-full overflow-hidden rounded-md bg-surface-raised shadow-card", ASPECT[formatId])}>
      {renderFormat(template, formatId, { pages: [page], assets, values, options: { still: true, startPage: number } })}
    </span>
  );
});

/**
 * The right panel (224 px, mockup `.pane-r`): the tabs **Pagine** and **Media** (Story
 * 4.5a, `MediaTab`), **Cerca** (filters the pages by name, or the files by file name) and
 * the grid or list view, shared by both tabs. Pagine lists the format's pages as live thumbnails, grouped by
 * section and labelled "{n} · {name}"; clicking one selects that page and brings it
 * to the middle of the canvas.
 */
export function RightPanel({
  hidden = false,
  formatId,
  template,
  pages,
  assets,
  values,
  currentPageKey,
  onSelectPage,
  onMovePage,
  media,
  clientMedia,
  mediaRules,
  mediaUpload,
  onStarMedia,
  tab,
  onTab: setTab,
  mediaTabRef,
  onPickMedia,
  onHide,
  hideRef,
}: RightPanelProps) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const searchId = useId();
  const q = query.trim().toLocaleLowerCase("it");
  const numbered = pages.map((page, i) => ({ page, number: i + 1 }));
  const shown = q === "" ? numbered : numbered.filter(({ page }) => page.name.toLocaleLowerCase("it").includes(q));
  const onPage = useMemo(() => pageAssetIds(pages), [pages]);
  /** The thumbnail a dragged page would land on (marked with an accent line). */
  const [dropOn, setDropOn] = useState<string | null>(null);
  /** The page being dragged. */
  const [dragging, setDragging] = useState<string | null>(null);
  const indexOf = (pageKey: string) => pages.findIndex((p) => p.pageKey === pageKey);

  return (
    <aside aria-label={it.configurator.panels.right} hidden={hidden} className="col-start-3 row-start-1 flex min-h-0 flex-col border-l border-border bg-surface-sidebar">
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-border p-3.5">
        <div className="flex items-center gap-1.5">
          <div role="group" aria-label={it.configurator.tabs.label} className={cn(SEG, "flex flex-1")}>
            <button type="button" aria-pressed={tab === "pages"} onClick={() => setTab("pages")} className={cn(SEG_BUTTON, "flex-1 px-1.5")}>
              {it.configurator.tabs.pages}
            </button>
            <button ref={mediaTabRef} type="button" aria-pressed={tab === "media"} onClick={() => setTab("media")} className={cn(SEG_BUTTON, "flex-1 px-1.5")}>
              {it.configurator.tabs.media}
            </button>
          </div>
          <button
            ref={hideRef}
            type="button"
            onClick={onHide}
            aria-label={it.configurator.panels.hideRight}
            title={it.configurator.panels.hide}
            className={ICON_BUTTON}
          >
            <PanelRight aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <label htmlFor={searchId} className="sr-only">
              {tab === "media" ? it.configurator.search.mediaLabel : it.configurator.search.label}
            </label>
            <Search aria-hidden="true" className={SEARCH_ICON} />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={it.configurator.search.placeholder}
              className={SEARCH_FIELD}
            />
          </div>
          <div role="group" aria-label={it.configurator.view.label} className={SEG}>
            <button type="button" aria-pressed={view === "grid"} aria-label={it.configurator.view.grid} title={it.configurator.view.grid} onClick={() => setView("grid")} className={cn(SEG_BUTTON, "px-2")}>
              <LayoutGrid aria-hidden="true" className="size-[15px]" />
            </button>
            <button type="button" aria-pressed={view === "list"} aria-label={it.configurator.view.list} title={it.configurator.view.list} onClick={() => setView("list")} className={cn(SEG_BUTTON, "px-2")}>
              <List aria-hidden="true" className="size-[15px]" />
            </button>
          </div>
        </div>
      </div>

      <div hidden={tab !== "pages"} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3.5">
        {shown.length === 0 && q !== "" && <p className="font-label text-[12.5px] text-foreground-muted">{fill(it.configurator.noMatch, { query: query.trim() })}</p>}
        {runsOf(shown).map(({ section, items: inSection }, run) => {
          return (
            <div key={`${section}-${run}`} className="mb-4 last:mb-0">
              <p className={EYEBROW}>{it.configurator.sections[section]}</p>
              <div className="flex flex-col gap-1.5">
                {inSection.map(({ page, number }) => (
                  <button
                    key={page.pageKey}
                    type="button"
                    data-thumb={page.pageKey}
                    aria-current={page.pageKey === currentPageKey ? "true" : undefined}
                    onClick={() => onSelectPage(page.pageKey)}
                    draggable={onMovePage !== undefined}
                    onDragStart={(event) => {
                      setDragging(page.pageKey);
                      event.dataTransfer.setData(PAGE_DRAG_TYPE, page.pageKey);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropOn(null);
                    }}
                    onDragOver={(event) => {
                      if (onMovePage === undefined || !event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dropOn !== page.pageKey) setDropOn(page.pageKey);
                    }}
                    onDragLeave={() => setDropOn((current) => (current === page.pageKey ? null : current))}
                    onDrop={(event) => {
                      if (onMovePage === undefined || !event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
                      event.preventDefault();
                      setDropOn(null);
                      const from = event.dataTransfer.getData(PAGE_DRAG_TYPE) || dragging;
                      setDragging(null);
                      if (from && from !== page.pageKey) onMovePage(from, page.pageKey);
                    }}
                    // Where the page lands: above this one when it comes from below, below it when it comes from above.
                    data-drop={
                      dropOn === page.pageKey && dragging !== null && dragging !== page.pageKey
                        ? indexOf(dragging) > indexOf(page.pageKey)
                          ? "before"
                          : "after"
                        : undefined
                    }
                    className={cn(
                      "flex rounded-lg p-1.5 text-left transition-colors duration-150 hover:bg-surface-hover aria-[current=true]:bg-surface-selected",
                      "data-[drop=before]:shadow-[0_-3px_0_var(--color-accent)] data-[drop=after]:shadow-[0_3px_0_var(--color-accent)]",
                      view === "grid" ? "flex-col gap-1.5" : "flex-row items-center gap-2.5",
                    )}
                  >
                    <span className={cn("block", view === "grid" ? "w-full" : "w-[52px] shrink-0")}>
                      <Thumbnail formatId={formatId} template={template} page={page} number={number} assets={assets} values={values} />
                    </span>
                    <small className="min-w-0 truncate font-label text-[12.5px] text-foreground-muted">
                      {fill(it.configurator.canvas.pageLabel, { n: number, name: page.name })}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <MediaTab
        hidden={tab !== "media"}
        files={media}
        clientFiles={clientMedia}
        rules={mediaRules}
        assets={assets}
        onPage={onPage}
        query={query}
        view={view}
        onStar={onStarMedia}
        upload={mediaUpload}
        onPick={onPickMedia}
      />
    </aside>
  );
}
