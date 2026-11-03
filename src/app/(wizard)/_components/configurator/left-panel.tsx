"use client";

import { GalleryHorizontal, Hash, Heading, Image, LayoutGrid, PanelLeft, Quote, Tag, Type, Video, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { PRESSABLE, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { ThemeSwitch } from "@/app/_components/theme-switch";
import type { ThemeChoice } from "@/app/_lib/theme";
import type { AnimationElement, AnimationId, Background, Block, DocumentElement, MediaFit, Page, TextGroupAlign } from "@/modules/generation";
import type { ListedAsset } from "@/modules/material";
import { defaultPages, layouts, textStyles, type DefaultPage, type FormatId, type Layout } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { BACKGROUND_SWATCHES, NEW_BLOCK_COLOUR, parseBackground, shuffleChoices, swatchBackground } from "./page-editing";
import { ASPECT, CHECKERBOARD, EYEBROW, ICON_BUTTON, PANEL_SECTION, SEG, SEG_BUTTON, SOON_ID } from "./styles";
import type { TextSettings } from "./text-editing";
import { GroupPanel, TextPanel } from "./text-panel";
import { AnimationPanel } from "./animation-panel";
import { MediaPanel } from "./media-panel";

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
  /** A Layout thumbnail pressed (Story 4.4a): the page takes that layout. */
  onLayout: (layout: Layout) => void;
  /** **Mescola**: the page moves to the next layout with its number of blocks. */
  onShuffle: () => void;
  /** A Pagine di default button (Story 4.4c). */
  onDefaultPage: (defaultPage: DefaultPage) => void;
  /** A Sfondo swatch or typed colour: the selected block's background, else the page's. */
  onBackground: (background: Background) => void;
  /** Sfondo's field got something that isn't a colour. */
  onBadColour: () => void;
  onSoon: (tool: string) => void;
  /** The case's images and videos: a selected image's or video's file (Story 4.5b). */
  files: readonly ListedAsset[];
  /** **Sostituisci dai Media** / **Scegli dai Media**: shows the Media tab. */
  onOpenMedia: () => void;
  /** **Adattamento** and **Zoom** on the selected image or video (Story 4.5b-3). */
  onFit: (fit: MediaFit) => void;
  onZoom: (zoom: number) => void;
  onZoomDone: () => void;
  /** A selected animation's settings (Story 4.5c). */
  onAnimationType: (animation: AnimationId) => void;
  onAnimationChange: () => void;
  onAnimationFit: (fit: AnimationElement["fit"]) => void;
  onAnimationSize: (size: number) => void;
  onAnimationSizeDone: () => void;
  /** **Elimina pagina** (Story 4.13): deletes the tools' page. */
  onDeletePage: () => void;
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

/** A page's default background: the template's white. */
const PAGE_COLOUR = BACKGROUND_SWATCHES[0];

/** A colour background's value, `transparent`, or undefined for an image. */
const colourOf = (background: Background): string | undefined =>
  background.kind === "colour" ? background.value.toLowerCase() : background.kind === "transparent" ? "transparent" : undefined;

/** A background colour as the field shows it: upper-case hex, "Trasparente", or empty for an image. */
const fieldValue = (colour: string | undefined) =>
  colour === undefined ? "" : colour === "transparent" ? it.configurator.tools.swatches.transparent : colour.toUpperCase();

/** One image of Sfondo's grid; an expired or broken thumbnail URL falls back to the image icon. */
function ImageTile({ file, pressed, editable, onPick }: { file: ListedAsset; pressed: boolean; editable: boolean; onPick: () => void }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const thumbnail = file.thumbnailUrl !== null && file.thumbnailUrl !== brokenUrl ? file.thumbnailUrl : null;
  return (
    <button
      type="button"
      aria-label={file.originalFileName}
      title={file.originalFileName}
      aria-pressed={pressed}
      onClick={onPick}
      {...(editable ? {} : { "aria-disabled": true, "aria-describedby": SOON_ID })}
      className={cn(
        "relative grid aspect-square place-items-center overflow-hidden rounded-md bg-surface-control text-foreground-muted shadow-control aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-accent aria-disabled:cursor-default",
        editable && PRESSABLE,
      )}
    >
      {thumbnail !== null ? (
        // A presigned GET of the thumbnail, as in the Media tab; no next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="" onError={() => setBrokenUrl(thumbnail)} className="absolute inset-0 size-full object-cover" />
      ) : (
        <Image aria-hidden="true" className="size-4" />
      )}
    </button>
  );
}

/**
 * Sfondo · Immagine (Story 4.5b-2, mockup `bgTools`): the case's images as small tiles,
 * the background's own pressed; a press makes it the background, **Togli immagine**
 * puts the default colour back. Videos are not backgrounds.
 */
function BackgroundImage({
  background,
  files,
  editable,
  onPick,
  onRemove,
  onSoon,
}: {
  background: Background;
  files: readonly ListedAsset[];
  editable: boolean;
  onPick: (assetId: string) => void;
  onRemove: () => void;
  onSoon: (tool: string) => void;
}) {
  const t = it.configurator.tools;
  const images = files.filter((file) => file.kind === "image");
  const current = background.kind === "image" ? background.assetId.toLowerCase() : null;
  const lock = editable ? {} : ({ "aria-disabled": true, "aria-describedby": SOON_ID } as const);
  return (
    <>
      {images.length === 0 ? (
        <p className="mt-2.5 font-label text-[12.5px] text-foreground-muted">{t.noBackgroundImages}</p>
      ) : (
        <div role="group" aria-label={t.backgroundImages} className="mt-2.5 grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto p-0.5">
          {images.map((file) => (
            <ImageTile
              key={file.id}
              file={file}
              pressed={current === file.id.toLowerCase()}
              editable={editable}
              onPick={editable ? () => onPick(file.id) : () => onSoon(t.image)}
            />
          ))}
        </div>
      )}
      {/* Also when the image is no longer listed: the person can always take it off. */}
      {current !== null && (
        <button
          type="button"
          onClick={editable ? onRemove : () => onSoon(t.image)}
          {...lock}
          className={cn(SECONDARY_ACTION, "mt-2.5 h-7 w-full text-[12.5px]", !editable && "cursor-default aria-disabled:opacity-60")}
        >
          {t.removeImage}
        </button>
      )}
    </>
  );
}

/**
 * Sfondo · Tinta unita (Story 4.4a, C30): the six swatches and a typed `#rrggbb`, on the
 * selected block's background or the page's. Immagine is `BackgroundImage` (Story 4.5b-2).
 */
function BackgroundColour({
  background,
  editable,
  onBackground,
  onBadColour,
  onSoon,
}: {
  background: Background;
  editable: boolean;
  onBackground: (background: Background) => void;
  onBadColour: () => void;
  onSoon: (tool: string) => void;
}) {
  const t = it.configurator.tools;
  const colour = colourOf(background);
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const lock = editable ? undefined : ({ "aria-disabled": true, "aria-describedby": SOON_ID } as const);

  function commit(input: HTMLInputElement) {
    const typed = input.value.trim();
    const parsed = editable ? parseBackground(typed) : undefined;
    if (parsed !== undefined) {
      onBackground(parsed);
      input.value = fieldValue(colourOf(parsed));
      return;
    }
    if (editable && typed !== "" && typed !== fieldValue(colour)) onBadColour();
    // Anything else (or no change) shows the current value again.
    input.value = fieldValue(colour);
  }

  // A new value from outside (a swatch, undo, another selection) replaces what the field shows,
  // unless it is being typed in: the same input stays, so Enter keeps the focus.
  useEffect(() => {
    if (field.current !== null && document.activeElement !== field.current) field.current.value = fieldValue(colour);
  }, [colour]);

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(event.currentTarget);
    } else if (event.key === "Escape") {
      event.currentTarget.value = fieldValue(colour);
      event.currentTarget.blur();
    }
  }

  return (
    <>
      <div className="mt-2.5 flex items-center gap-2">
        <label htmlFor={id} className="w-[76px] shrink-0 font-label text-[12.5px] text-foreground-muted">
          {t.colour}
        </label>
        <div className="flex h-[30px] min-w-0 flex-1 items-center gap-2 rounded-md bg-field px-2.5 shadow-control">
          {/* The document's colour (a template value), shown as it is. */}
          <span
            aria-hidden="true"
            className={cn("size-3.5 shrink-0 rounded-[4px] shadow-control", colour === "transparent" && CHECKERBOARD)}
            style={colour === undefined || colour === "transparent" ? undefined : { background: colour }}
          />
          <input
            ref={field}
            id={id}
            aria-label={t.colourField}
            defaultValue={fieldValue(colour)}
            readOnly={!editable}
            aria-describedby={editable ? undefined : SOON_ID}
            spellCheck={false}
            autoComplete="off"
            onKeyDown={onKey}
            onBlur={(event) => commit(event.currentTarget)}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none"
          />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={t.colour}>
        {BACKGROUND_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={t.swatches[swatch]}
            title={t.swatches[swatch]}
            aria-pressed={colour === swatch}
            onClick={editable ? () => onBackground(swatchBackground(swatch)) : () => onSoon(t.background)}
            {...lock}
            className={cn(
              "size-[22px] rounded-md shadow-control aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-accent aria-disabled:cursor-default",
              swatch === "transparent" && CHECKERBOARD,
            )}
            style={swatch === "transparent" ? undefined : { background: swatch }}
          />
        ))}
      </div>
    </>
  );
}

/**
 * The left panel (312 px, mockup `.pane-l`): the selected block's or element's name
 * first, with a text's settings or a Testi group's alignment (Story 4.3b), or an image's
 * or video's file with **Sostituisci dai Media** (Story 4.5b), then always
 * the page tools, acting on the selected page or the page in view:
 * **Layout**, **Pagine di default**, **Elementi**, **Sfondo** and **Elimina pagina**.
 * Elementi adds a block or an element, and the selection has its **Rimuovi** button
 * (Story 4.3c). Layout, **Mescola** and Sfondo's colours change the page (Story 4.4a).
 * The rest arrive with Stories 4.4b–c, 4.5 and 4.13: here they show in place, inactive,
 * and say so when pressed. The theme switch sits at its foot.
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
  onLayout,
  onShuffle,
  onDefaultPage,
  onBackground,
  onBadColour,
  onSoon,
  files,
  onOpenMedia,
  onFit,
  onZoom,
  onZoomDone,
  onAnimationType,
  onAnimationChange,
  onAnimationFit,
  onAnimationSize,
  onAnimationSizeDone,
  onDeletePage,
  onHide,
  hideRef,
}: LeftPanelProps) {
  const t = it.configurator.tools;
  const soon = (tool: string) => () => onSoon(tool);
  const inactive = { "aria-disabled": true, "aria-describedby": SOON_ID, title: it.configurator.soon } as const;
  const background = block !== undefined ? block.background : page?.background;
  /** Where Sfondo's Immagine was pressed on a colour background: the grid shows there until a colour is set or the selection moves. */
  const target = `${formatId}:${page?.pageKey ?? ""}:${block?.blockId ?? ""}`;
  const [imageTabFor, setImageTabFor] = useState<string | null>(null);
  const setImageTab = (open: boolean) => setImageTabFor(open ? target : null);
  const showImages = background?.kind === "image" || imageTabFor === target;
  const defaultColour: Background = { kind: "colour", value: block !== undefined ? NEW_BLOCK_COLOUR : PAGE_COLOUR };
  const shuffles = page === undefined ? 0 : shuffleChoices(formatId, template, page.blocks.length).length;
  /** A tool's heading: "Arriva presto" beside it while the document can't change. */
  const heading = (text: string) => (editable ? <p className={EYEBROW}>{text}</p> : <SoonHeading>{text}</SoonHeading>);

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
        {(element?.type === "image" || element?.type === "video") && (
          <MediaPanel
            element={element}
            files={files}
            editable={editable}
            onOpenMedia={onOpenMedia}
            onSoon={onSoon}
            onFit={onFit}
            onZoom={onZoom}
            onZoomDone={onZoomDone}
          />
        )}
        {element?.type === "animation" && (
          <AnimationPanel
            element={element}
            editable={editable}
            onType={onAnimationType}
            onChange={onAnimationChange}
            onFit={onAnimationFit}
            onSize={onAnimationSize}
            onSizeDone={onAnimationSizeDone}
            onSoon={onSoon}
          />
        )}

        {page !== undefined && (
          <>
            <div className={cn(PANEL_SECTION, "pb-1 border-b-0")}>
              <div className="font-label text-[12.5px] text-foreground-muted">{it.configurator.crumbs.page}</div>
              <div className="mt-0.5 font-display text-[15px] leading-snug font-semibold tracking-[-0.016em] text-foreground-strong">{page.name}</div>
            </div>

            <section className={PANEL_SECTION} aria-label={t.layout}>
              {heading(t.layout)}
              <div className={cn("grid gap-2", formatId === "video_9_16" ? "grid-cols-4" : "grid-cols-3")}>
                {layouts(formatId, template).map((layout) => (
                  <button
                    key={layout.layoutId}
                    type="button"
                    {...(editable ? {} : inactive)}
                    aria-label={fill(t.layoutOption, { name: layout.name })}
                    aria-pressed={layout.layoutId === page.grid.layoutId}
                    onClick={editable ? () => onLayout(layout) : soon(t.layout)}
                    className={cn(
                      "block overflow-hidden rounded-md bg-surface-raised shadow-card aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-accent",
                      editable ? cn("hover:bg-surface-hover", PRESSABLE) : "cursor-default",
                      ASPECT[formatId],
                    )}
                  >
                    <LayoutThumb layout={layout} />
                  </button>
                ))}
              </div>
              {shuffles >= 2 && (
                <button
                  type="button"
                  {...(editable ? {} : inactive)}
                  onClick={editable ? onShuffle : soon(t.shuffle)}
                  className={cn(SECONDARY_ACTION, "mt-2.5 h-7 w-full text-[12.5px]", !editable && "cursor-default aria-disabled:opacity-60")}
                >
                  {t.shuffle}
                </button>
              )}
            </section>

            <section className={PANEL_SECTION} aria-label={t.defaultPages}>
              {heading(t.defaultPages)}
              <div className="grid grid-cols-2 gap-1.5">
                {defaultPages(formatId, template).map((dp) => (
                  <button
                    key={dp.key}
                    type="button"
                    {...(editable ? {} : inactive)}
                    onClick={editable ? () => onDefaultPage(dp) : soon(t.defaultPages)}
                    className={cn(
                      "min-h-9 rounded-md bg-surface-raised px-2.5 py-1.5 text-left font-label text-[12.5px] leading-tight text-foreground shadow-card",
                      editable ? cn("hover:bg-surface-hover", PRESSABLE) : "cursor-default",
                    )}
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
              const active = editable;
              return (
                <button
                  key={key}
                  type="button"
                  {...(active ? {} : inactive)}
                  onClick={active ? () => onAddElement(key) : soon(t.elements)}
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
              {heading(fill(t.backgroundOf, { what: block !== undefined ? t.backgroundBlock : t.backgroundPage }))}
              <div className={cn(SEG, "flex")}>
                <button
                  type="button"
                  {...(editable ? {} : inactive)}
                  aria-pressed={!showImages}
                  // On an image, Tinta unita goes back to the default colour (mockup `wireBgTools`).
                  onClick={
                    !editable
                      ? soon(t.background)
                      : () => {
                          setImageTab(false);
                          if (background?.kind === "image") onBackground(defaultColour);
                        }
                  }
                  className={cn(SEG_BUTTON, "flex-1 px-1.5")}
                >
                  {t.solid}
                </button>
                <button
                  type="button"
                  {...(editable ? {} : inactive)}
                  aria-pressed={showImages}
                  onClick={editable ? () => setImageTab(true) : soon(t.image)}
                  className={cn(SEG_BUTTON, "flex-1 px-1.5")}
                >
                  {t.image}
                </button>
              </div>
              {background !== undefined && !showImages && (
                <BackgroundColour background={background} editable={editable} onBackground={onBackground} onBadColour={onBadColour} onSoon={onSoon} />
              )}
              {background !== undefined && showImages && (
                <BackgroundImage
                  background={background}
                  files={files}
                  editable={editable}
                  onPick={(assetId) => onBackground({ kind: "image", assetId })}
                  onRemove={() => {
                    setImageTab(false);
                    onBackground(defaultColour);
                  }}
                  onSoon={onSoon}
                />
              )}
            </section>

            <section className={PANEL_SECTION}>
              <button
                type="button"
                {...(editable ? {} : inactive)}
                onClick={editable ? onDeletePage : soon(t.deletePage)}
                className={cn(SECONDARY_ACTION, "h-7 w-full text-[12.5px]", !editable && "cursor-default aria-disabled:opacity-60")}
              >
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
