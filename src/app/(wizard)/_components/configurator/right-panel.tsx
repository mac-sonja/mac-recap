"use client";

import { LayoutGrid, List, PanelRight, Search } from "lucide-react";
import { memo, useId, useState, type Ref } from "react";
import { SEARCH_FIELD, SEARCH_ICON } from "@/app/_components/field-styles";
import type { Page, PageSection } from "@/modules/generation";
import { renderFormat, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { ASPECT, EYEBROW, ICON_BUTTON, SEG, SEG_BUTTON, SOON_ID } from "./styles";

const SECTIONS: readonly PageSection[] = ["intro", "output", "risultati"];

export interface RightPanelProps {
  formatId: FormatId;
  template: string;
  pages: readonly Page[];
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
  /** The selected page, marked `aria-current`. */
  currentPageKey: string | undefined;
  onSelectPage: (pageKey: string) => void;
  onSoon: (tool: string) => void;
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
 * The right panel (224 px, mockup `.pane-r`): the tabs **Pagine** and **Media** (Media
 * arrives with Story 4.5 and says so), **Cerca** (filters the pages by name) and the
 * grid or list view. Pagine lists the format's pages as live thumbnails, grouped by
 * section and labelled "{n} · {name}"; clicking one selects that page and brings it
 * to the middle of the canvas.
 */
export function RightPanel({ formatId, template, pages, assets, values, currentPageKey, onSelectPage, onSoon, onHide, hideRef }: RightPanelProps) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const searchId = useId();
  const q = query.trim().toLocaleLowerCase("it");
  const numbered = pages.map((page, i) => ({ page, number: i + 1 }));
  const shown = q === "" ? numbered : numbered.filter(({ page }) => page.name.toLocaleLowerCase("it").includes(q));

  return (
    <aside aria-label={it.configurator.panels.right} className="col-start-3 row-start-1 flex min-h-0 flex-col border-l border-border bg-surface-sidebar">
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-border p-3.5">
        <div className="flex items-center gap-1.5">
          <div role="group" aria-label={it.configurator.tabs.label} className={cn(SEG, "flex flex-1")}>
            <button type="button" aria-pressed="true" className={cn(SEG_BUTTON, "flex-1 px-1.5")}>
              {it.configurator.tabs.pages}
            </button>
            <button
              type="button"
              aria-pressed="false"
              aria-disabled="true"
              aria-describedby={SOON_ID}
              title={it.configurator.soon}
              onClick={() => onSoon(it.configurator.tabs.media)}
              className={cn(SEG_BUTTON, "flex-1 px-1.5")}
            >
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
              {it.configurator.search.label}
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

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3.5">
        {shown.length === 0 && q !== "" && <p className="font-label text-[12.5px] text-foreground-muted">{fill(it.configurator.noMatch, { query: query.trim() })}</p>}
        {SECTIONS.map((section) => {
          const inSection = shown.filter(({ page }) => page.section === section);
          if (inSection.length === 0) return null;
          return (
            <div key={section} className="mb-4 last:mb-0">
              <p className={EYEBROW}>{it.configurator.sections[section]}</p>
              <div className="flex flex-col gap-1.5">
                {inSection.map(({ page, number }) => (
                  <button
                    key={page.pageKey}
                    type="button"
                    data-thumb={page.pageKey}
                    aria-current={page.pageKey === currentPageKey ? "true" : undefined}
                    onClick={() => onSelectPage(page.pageKey)}
                    className={cn(
                      "flex rounded-lg p-1.5 text-left transition-colors duration-150 hover:bg-surface-hover aria-[current=true]:bg-surface-selected",
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
    </aside>
  );
}
