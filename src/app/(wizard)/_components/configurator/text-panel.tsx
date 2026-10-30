"use client";

import { AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalSpaceBetween, type LucideIcon } from "lucide-react";
import { useId, type KeyboardEvent } from "react";
import { TEXT_STYLES, type Block, type TextAlign, type TextElement, type TextGroupAlign, type TextGroupElement } from "@/modules/generation";
import { textStyles, type FormatId } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { CHECKERBOARD, EYEBROW, PANEL_SECTION, SEG, SEG_BUTTON, SOON_ID } from "./styles";
import { parseColour, shownColour, TEXT_COLOURS, type TextColour, type TextSettings } from "./text-editing";

/** A control's label column (mockup `.row label`). */
const ROW = "mt-2 flex items-center gap-2 first-of-type:mt-0";
const ROW_LABEL = "w-[76px] shrink-0 font-label text-[12.5px] text-foreground-muted";


/** A colour as the field shows it: upper-case hex, or "Trasparente". */
const shown = (colour: string) => (colour === "transparent" ? it.configurator.text.transparent : colour.toUpperCase());

/** Props a locked control gets: inactive, and saying so when pressed. */
function lockedProps(locked: boolean, onLocked: () => void) {
  return locked ? ({ "aria-disabled": true, "aria-describedby": SOON_ID, onClick: onLocked } as const) : undefined;
}

export interface TextPanelProps {
  formatId: FormatId;
  template: string;
  text: TextElement;
  block: Block;
  /** False on an approved case or the trial pages: the values show, nothing changes. */
  editable: boolean;
  onChange: (settings: TextSettings) => void;
  onSoon: (tool: string) => void;
}

/**
 * "Testo · {format}" (Story 4.3b, C32, mockup `renderBlockProps`): Stile, Allinea,
 * Colore (the template's palette, transparent, or a typed colour) and Colonne. Each
 * change is one undo step on the format in view.
 */
export function TextPanel({ formatId, template, text, block, editable, onChange, onSoon }: TextPanelProps) {
  const t = it.configurator.text;
  const styles = textStyles(formatId, template);
  const colour = shownColour(text, block);
  const align = text.align ?? "left";
  const columns = text.columns ?? 1;
  const locked = !editable;
  const lock = (tool: string) => lockedProps(locked, () => onSoon(tool));
  const ids = useId();

  /** Sets `next` unless it is the colour the text already shows (an inherited one stays inherited). */
  function pick(next: TextColour) {
    if (next !== colour.toLowerCase()) onChange({ colour: next });
  }

  function commitColour(input: HTMLInputElement) {
    const parsed = parseColour(input.value);
    if (parsed !== undefined && !locked) pick(parsed);
    // Anything else (or no change) shows the current value again.
    input.value = shown(parsed !== undefined && !locked ? parsed : colour);
  }

  function onColourKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitColour(event.currentTarget);
    } else if (event.key === "Escape") {
      event.currentTarget.value = shown(colour);
      event.currentTarget.blur();
    }
  }

  const aligns: readonly [TextAlign, string][] = [
    ["left", t.alignLeft],
    ["centre", t.alignCentre],
    ["right", t.alignRight],
  ];

  return (
    <section className={PANEL_SECTION} aria-label={fill(t.heading, { format: it.configurator.formats[formatId] })}>
      <p className={EYEBROW}>{fill(t.heading, { format: it.configurator.formats[formatId] })}</p>

      <div className={ROW}>
        <label htmlFor={`${ids}-style`} className={ROW_LABEL}>
          {t.style}
        </label>
        <select
          id={`${ids}-style`}
          value={text.style}
          disabled={locked}
          aria-describedby={locked ? SOON_ID : undefined}
          onChange={(event) => onChange({ style: event.target.value as TextElement["style"] })}
          className="h-[30px] min-w-0 flex-1 rounded-md bg-field px-2 font-label text-[13px] text-foreground shadow-control disabled:opacity-60"
        >
          {TEXT_STYLES.map((style) => (
            <option key={style} value={style}>
              {styles[style].name}
            </option>
          ))}
        </select>
      </div>

      <div className={ROW} role="group" aria-label={t.align}>
        <span className={ROW_LABEL}>{t.align}</span>
        <div className={cn(SEG, "flex flex-1")}>
          {aligns.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={align === value}
              onClick={() => onChange({ align: value })}
              {...lock(t.align)}
              className={cn(SEG_BUTTON, "flex-1 px-1.5")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={ROW}>
        <label htmlFor={`${ids}-colour`} className={ROW_LABEL}>
          {t.colour}
        </label>
        <div className="flex h-[30px] min-w-0 flex-1 items-center gap-2 rounded-md bg-field px-2.5 shadow-control">
          <span
            aria-hidden="true"
            className={cn("size-3.5 shrink-0 rounded-[4px] shadow-control", colour === "transparent" && CHECKERBOARD)}
            style={colour === "transparent" ? undefined : { background: colour }}
          />
          <input
            // A new value from outside (a swatch, undo) resets what was typed.
            key={colour}
            id={`${ids}-colour`}
            aria-label={t.colourField}
            defaultValue={shown(colour)}
            readOnly={locked}
            aria-describedby={locked ? SOON_ID : undefined}
            spellCheck={false}
            autoComplete="off"
            onKeyDown={onColourKey}
            onBlur={(event) => commitColour(event.currentTarget)}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none"
          />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={t.colour}>
        {TEXT_COLOURS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={swatch === "transparent" ? t.transparent : swatch.toUpperCase()}
            title={swatch === "transparent" ? t.transparent : swatch.toUpperCase()}
            aria-pressed={colour.toLowerCase() === swatch}
            onClick={() => pick(swatch)}
            {...lock(t.colour)}
            className={cn(
              "size-[22px] rounded-md shadow-control aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-accent aria-disabled:cursor-default",
              swatch === "transparent" && CHECKERBOARD,
            )}
            style={swatch === "transparent" ? undefined : { background: swatch }}
          />
        ))}
      </div>

      <div className={cn(ROW, "mt-3")} role="group" aria-label={t.columns}>
        <span className={ROW_LABEL}>{t.columns}</span>
        <div className={cn(SEG, "flex flex-1")}>
          {([1, 2] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-label={value === 1 ? t.oneColumn : t.twoColumns}
              aria-pressed={columns === value}
              onClick={() => onChange({ columns: value })}
              {...lock(t.columns)}
              className={cn(SEG_BUTTON, "flex-1 px-1.5")}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

const GROUP_ICONS: Readonly<Record<TextGroupAlign, LucideIcon>> = {
  top: AlignVerticalJustifyStart,
  centre: AlignVerticalJustifyCenter,
  bottom: AlignVerticalJustifyEnd,
  split: AlignVerticalSpaceBetween,
};

export interface GroupPanelProps {
  group: TextGroupElement;
  editable: boolean;
  onChange: (align: TextGroupAlign) => void;
  onSoon: (tool: string) => void;
}

/** A Testi group's "Allineamento nel blocco" (C30): In alto, Al centro, In basso, Distanziati. */
export function GroupPanel({ group, editable, onChange, onSoon }: GroupPanelProps) {
  const t = it.configurator.group;
  const split = group.splitAt ?? 1;
  const names: Readonly<Record<TextGroupAlign, string>> = {
    top: t.top,
    centre: t.centre,
    bottom: t.bottom,
    split: split === 1 ? t.splitOne : fill(t.splitMany, { n: split }),
  };
  return (
    <section className={PANEL_SECTION} aria-label={t.heading}>
      <p className={EYEBROW}>{t.heading}</p>
      <div className={cn(SEG, "flex")}>
        {(Object.keys(GROUP_ICONS) as TextGroupAlign[]).map((align) => {
          const Icon = GROUP_ICONS[align];
          return (
            <button
              key={align}
              type="button"
              aria-label={names[align]}
              title={names[align]}
              aria-pressed={group.align === align}
              onClick={() => onChange(align)}
              {...lockedProps(!editable, () => onSoon(t.heading))}
              className={cn(SEG_BUTTON, "flex-1 px-1.5")}
            >
              <Icon aria-hidden="true" className="size-4" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
