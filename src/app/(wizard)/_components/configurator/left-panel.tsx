"use client";

import { GalleryHorizontal, Hash, Heading, Image, LayoutGrid, PanelLeft, Quote, Tag, Type, Video, type LucideIcon } from "lucide-react";
import type { Ref } from "react";
import { PRESSABLE, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { ThemeSwitch } from "@/app/_components/theme-switch";
import type { ThemeChoice } from "@/app/_lib/theme";
import type { Background, Block, DocumentElement, Page, TextGroupAlign } from "@/modules/generation";
import { defaultPages, layouts, textStyles, type FormatId, type Layout } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { ASPECT, EYEBROW, ICON_BUTTON, PANEL_SECTION, SEG, SEG_BUTTON, SOON_ID } from "./styles";
import type { TextSettings } from "./text-editing";
import { GroupPanel, TextPanel } from "./text-panel";

export type ElementKey = keyof typeof it.configurator.elements;

const ELEMENT_ICONS: Readonly<Record<ElementKey, LucideIcon>> = {
  block: LayoutGrid,
  group: Type,
  title: Heading,
  text: Type,
  number: Hash,
  quote: Quote,
  label: Tag,
  image: Image,
  video: Video,
  animation: GalleryHorizontal,
};

export interface LeftPanelProps {
  /** Hidden from its own bar; kept mounted so its state survives. */
  hidden?: boolean;
  formatId: FormatId;
  template: string;
  /** The page the tools act on: the selected one, or the one in view when nothing is selected. */
  page: Page | undefined;
  block: Block | undefined;
  element: DocumentElement | undefined;
  theme: ThemeChoice;
  /** The text and group settings change the document (Story 4.3b); off, they only show. */
  editable: boolean;
  onTextSettings: (settings: TextSettings) => void;
  onGroupAlign: (align: TextGroupAlign) => void;
  /** An Elementi button pressed (Story 4.3c): Blocco adds a block, the others an element to the selected block. */
  onAddElement: (key: ElementKey) => void;
  /** **Rimuovi elemento** / **Rimuovi blocco**: removes the selection. */
  onRemove: () => void;
  onSoon: (tool: string) => void;
  onHide: () => void;
  hideRef: Ref<HTMLButtonElement>;
}

/** A selected element's name: a text says its style (the template's Italian name). */
function elementName(element: DocumentElement, formatId: FormatId, template: string): string {
  if (element.type === "text") return textStyles(formatId, template)[element.style].name;
  return it.configurator.elementTypes[element.type];
}

/** A section heading with the "Arriva presto" hint on the right. */
function SoonHeading({ children }: { children: string }) {
  return (
    <p className={EYEBROW}>
      {children}
      <span className="font-label text-[11px] font-medium tracking-normal text-foreground-muted normal-case">{it.configurator.soon}</span>
    </p>
  );
}

/** **Rimuovi elemento** / **Rimuovi blocco** under the selection's name; off, it says it arrives soon. */
function RemoveButton({ label, editable, onRemove, onSoon }: { label: string; editable: boolean; onRemove: () => void; onSoon: (tool: string) => void }) {
  return (
    <button
      type="button"
      {...(editable ? {} : { "aria-disabled": true, "aria-describedby": SOON_ID, title: it.configurator.soon })}
      onClick={editable ? onRemove : () => onSoon(label)}
      className={cn(SECONDARY_ACTION, "mt-3 h-7 w-full text-[12.5px]", !editable && "cursor-default aria-disabled:opacity-60")}
    >
      {label}
    </button>
  );
}

/** A layout's grid, drawn small: one grey cell per block. */
function LayoutThumb({ layout }: { layout: Layout }) {
  const tracks = (sizes: readonly number[]) => sizes.map((v) => `minmax(0,${v}fr)`).join(" ");
  return (
    <span className="grid size-full gap-[3px] p-[5px]" style={{ gridTemplate: `${tracks(layout.rows)} / ${tracks(layout.cols)}` }}>
      {layout.areas.map((area, i) => (
        <span key={i} className="rounded-[3px] bg-surface-control" style={{ gridArea: `${area[0]} / ${area[1]} / ${area[2]} / ${area[3]}` }} />
      ))}
    </span>
  );
}

/** A colour background's value, `transparent`, or undefined for an image. */
const colourOf = (background: Background): string | undefined =>
  background.kind === "colour" ? background.value : background.kind === "transparent" ? "transparent" : undefined;

/**
 * The left panel (312 px, mockup `.pane-l`): the selected block's or element's name
 * first, with a text's settings or a Testi group's alignment (Story 4.3b), then always
 * the page tools, acting on the selected page or the page in view:
 * **Layout**, **Pagine di default**, **Elementi**, **Sfondo** and **Elimina pagina**.
 * Elementi adds a block or an element, and the selection has its **Rimuovi** button
 * (Story 4.3c). The rest arrive with Stories 4.4, 4.5 and 4.13: here they show in place, inactive, and
 * say so when pressed. The theme switch sits at its foot.
 */
export function LeftPanel({
  hidden = false,
  formatId,
  template,
  page,
  block,
  element,
  theme,
  editable,
  onTextSettings,
  onGroupAlign,
  onAddElement,
  onRemove,
  onSoon,
  onHide,
  hideRef,
}: LeftPanelProps) {
  const t = it.configurator.tools;
  const soon = (tool: string) => () => onSoon(tool);
  const inactive = { "aria-disabled": true, "aria-describedby": SOON_ID, title: it.configurator.soon } as const;
  const background = block !== undefined ? block.background : page?.background;
  const backgroundColour = background === undefined ? undefined : colourOf(background);

  return (
    <aside aria-label={it.configurator.panels.left} hidden={hidden} className="col-start-1 row-start-1 flex min-h-0 flex-col border-r border-border bg-surface-sidebar">
      <div className="flex px-2.5 pt-2">
        <button
          ref={hideRef}
          type="button"
          onClick={onHide}
          aria-label={it.configurator.panels.hideLeft}
          title={it.configurator.panels.hide}
          className={ICON_BUTTON}
        >
          <PanelLeft aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {block !== undefined && (
          <div className={PANEL_SECTION}>
            <div className="font-label text-[12.5px] text-foreground-muted">{element === undefined ? it.configurator.crumbs.block : block.name}</div>
            <div className="mt-0.5 font-display text-[15px] leading-snug font-semibold tracking-[-0.016em] text-foreground-strong">
              {element === undefined ? block.name : elementName(element, formatId, template)}
            </div>
            <RemoveButton
              label={element === undefined ? it.configurator.edit.removeBlock : it.configurator.edit.removeElement}
              editable={editable}
              onRemove={onRemove}
              onSoon={onSoon}
            />
          </div>
        )}
        {block !== undefined && element?.type === "text" && (
          <TextPanel formatId={formatId} template={template} text={element} block={block} editable={editable} onChange={onTextSettings} onSoon={onSoon} />
        )}
        {element?.type === "text_group" && <GroupPanel group={element} editable={editable} onChange={onGroupAlign} onSoon={onSoon} />}

        {page !== undefined && (
          <>
            <div className={cn(PANEL_SECTION, "pb-1 border-b-0")}>
              <div className="font-label text-[12.5px] text-foreground-muted">{it.configurator.crumbs.page}</div>
              <div className="mt-0.5 font-display text-[15px] leading-snug font-semibold tracking-[-0.016em] text-foreground-strong">{page.name}</div>
            </div>

            <section className={PANEL_SECTION} aria-label={t.layout}>
              <SoonHeading>{t.layout}</SoonHeading>
              <div className={cn("grid gap-2", formatId === "video_9_16" ? "grid-cols-4" : "grid-cols-3")}>
                {layouts(formatId, template).map((layout) => (
                  <button
                    key={layout.layoutId}
                    type="button"
                    {...inactive}
                    aria-label={fill(t.layoutOption, { name: layout.name })}
                    aria-pressed={layout.layoutId === page.grid.layoutId}
                    onClick={soon(t.layout)}
                    className={cn(
                      "block cursor-default overflow-hidden rounded-md bg-surface-raised shadow-card aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-accent",
                      ASPECT[formatId],
                    )}
                  >
                    <LayoutThumb layout={layout} />
                  </button>
                ))}
              </div>
            </section>

            <section className={PANEL_SECTION} aria-label={t.defaultPages}>
              <SoonHeading>{t.defaultPages}</SoonHeading>
              <div className="grid grid-cols-2 gap-1.5">
                {defaultPages(formatId, template).map((dp) => (
                  <button
                    key={dp.key}
                    type="button"
                    {...inactive}
                    onClick={soon(t.defaultPages)}
                    className="min-h-9 cursor-default rounded-md bg-surface-raised px-2.5 py-1.5 text-left font-label text-[12.5px] leading-tight text-foreground shadow-card"
                  >
                    {dp.name}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        <section className={PANEL_SECTION} aria-label={t.elements}>
          {editable ? <p className={EYEBROW}>{t.elements}</p> : <SoonHeading>{t.elements}</SoonHeading>}
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(it.configurator.elements) as ElementKey[]).map((key) => {
              const Icon = ELEMENT_ICONS[key];
              // Animazione arrives with its dialog (Story 4.5).
              const active = editable && key !== "animation";
              return (
                <button
                  key={key}
                  type="button"
                  {...(active ? {} : inactive)}
                  onClick={active ? () => onAddElement(key) : soon(key === "animation" ? it.configurator.elements.animation : t.elements)}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md bg-surface-raised px-2.5 font-label text-[13px] font-medium text-foreground shadow-card",
                    active ? cn("hover:bg-surface-hover", PRESSABLE) : "cursor-default aria-disabled:opacity-60",
                  )}
                >
                  <Icon aria-hidden="true" className="size-[15px] shrink-0 text-foreground-muted" />
                  {it.configurator.elements[key]}
                </button>
              );
            })}
          </div>
        </section>

        {page !== undefined && (
          <>
            <section className={PANEL_SECTION} aria-label={t.background}>
              <SoonHeading>{fill(t.backgroundOf, { what: block !== undefined ? t.backgroundBlock : t.backgroundPage })}</SoonHeading>
              <div className={cn(SEG, "flex")}>
                <button type="button" {...inactive} aria-pressed={background?.kind !== "image"} onClick={soon(t.background)} className={cn(SEG_BUTTON, "flex-1 px-1.5")}>
                  {t.solid}
                </button>
                <button type="button" {...inactive} aria-pressed={background?.kind === "image"} onClick={soon(t.background)} className={cn(SEG_BUTTON, "flex-1 px-1.5")}>
                  {t.image}
                </button>
              </div>
              {backgroundColour !== undefined && (
                <div className="mt-2 flex h-[30px] items-center gap-2 rounded-md bg-field px-2.5 shadow-control">
                  {/* The document's colour (a template value), shown as it is. */}
                  <span aria-hidden="true" className="size-3.5 shrink-0 rounded-[4px] shadow-control" style={{ background: backgroundColour }} />
                  <span className="font-mono text-xs text-foreground">{backgroundColour === "transparent" ? backgroundColour : backgroundColour.toUpperCase()}</span>
                </div>
              )}
            </section>

            <section className={PANEL_SECTION}>
              <button type="button" {...inactive} onClick={soon(t.deletePage)} className={cn(SECONDARY_ACTION, "h-7 w-full cursor-default text-[12.5px] aria-disabled:opacity-60")}>
                {t.deletePage}
              </button>
            </section>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-3.5 py-3">
        <ThemeSwitch initial={theme} layout="row" />
      </div>
    </aside>
  );
}
