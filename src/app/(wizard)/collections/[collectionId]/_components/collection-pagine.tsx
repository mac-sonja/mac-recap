"use client";

import { GripVertical, Lock, MoreHorizontal, Plus } from "lucide-react";
import { memo, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import type { Page } from "@/modules/generation";
import { renderFormat, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { ASPECT, EYEBROW, ICON_BUTTON } from "@/app/(wizard)/_components/configurator/styles";
import type { CollectionGroup, ViewSegment } from "./collection-file";

/** A group's drag data type: its client id. A case's: its case id. They never mix. */
const GROUP_DRAG_TYPE = "application/x-mac-collection-group";
const CASE_DRAG_TYPE = "application/x-mac-collection-case";

/** A page's still thumbnail, drawn by the format's renderer (as the configurator's Pagine). */
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

/** One entry of a row's menu. */
interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * A row's "⋯" menu: a button that opens a short list of actions (`role="menu"`), focus on its
 * first item; ↑/↓ move between items, Esc and a click elsewhere close it, focus back on the button.
 */
function RowMenu({ label, items }: { label: string; items: readonly MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    const away = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    // Tab leaves the menu: it closes and focus moves on as usual.
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const entries = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    entries[(at + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length]?.focus();
  };
  return (
    <div className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((was) => !was);
        }}
        className={cn(ICON_BUTTON, "size-7")}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKey}
          className="absolute top-full right-0 z-30 mt-1 flex w-52 origin-top-right flex-col rounded-lg bg-surface-raised p-1 shadow-popover motion-safe:animate-dialog-in"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              onClick={(event) => {
                event.stopPropagation();
                if (item.disabled) return;
                setOpen(false);
                button.current?.focus();
                item.onSelect();
              }}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-left font-label text-[13px] text-foreground hover:bg-surface-hover focus-visible:bg-surface-hover aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
                item.danger && "text-danger",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "{n} pagine", "1 pagina" for one. */
const pageCountLabel = (n: number) => (n === 1 ? it.collection.pages.pageCountOne : fill(it.collection.pages.pageCount, { n }));
/** "{code} · {n} pagine", "{code} · 1 pagina" for one. */
const casePagesLabel = (code: string, n: number) =>
  fill(n === 1 ? it.collection.pages.casePagesOne : it.collection.pages.casePages, { code, n });

export interface CollectionPagineProps {
  formatId: FormatId;
  groups: readonly CollectionGroup[];
  /** The format's segments, as the canvas shows them: what each row's thumbnail and page count read. */
  segments: readonly ViewSegment[];
  assets: Readonly<Record<string, RenderAsset>>;
  /** A row clicked: the canvas scrolls to that segment. */
  onSelect: (segmentKey: string) => void;
  /** A client's whole group to place `to` among the groups (from 0). */
  onMoveGroup: (clientId: string, to: number) => void;
  /** A case to place `to` within its own group (from 0). */
  onMoveCase: (caseId: string, to: number) => void;
  /** **Rimuovi dalla raccolta** on a case (it asks to confirm). */
  onRemove: (caseId: string) => void;
  /** **Aggiungi casi**. */
  onAdd: () => void;
  /** A case dropped on another client's group: refused, and said why. */
  onRefused: (text: string) => void;
}

/**
 * The collection's **Pagine** panel (Story 5.10a): one group per client, in order. Each group
 * holds a locked row for the client's intro and one for its closing whenever they show (2+ of
 * its cases with an approved intro), and one row per case: its first page, name and "{code} ·
 * {n} pagine", or "Non disponibile" greyed for a case with no approved revision. Groups move as a
 * whole, cases only within their group: by drag, by Alt+↑/↓, or by the row's menu (**Sposta su**,
 * **Sposta giù**). A case's menu also has **Rimuovi dalla raccolta**. **Aggiungi casi** at the end.
 */
export function CollectionPagine({ formatId, groups, segments, assets, onSelect, onMoveGroup, onMoveCase, onRemove, onAdd, onRefused }: CollectionPagineProps) {
  const copy = it.collection.pages;
  const hintId = useId();
  /** What is being dragged: a group (its client) or a case (with its client). */
  const [dragging, setDragging] = useState<{ kind: "group"; clientId: string } | { kind: "case"; caseId: string; clientId: string } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  /** The row moved with the keyboard keeps the focus once it has moved. */
  const refocus = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const order = groups.map((g) => `${g.clientId}:${g.cases.map((c) => c.caseId).join(",")}`).join("|");
  useEffect(() => {
    const key = refocus.current;
    if (key === null) return;
    refocus.current = null;
    root.current?.querySelector<HTMLElement>(`[data-row="${key}"]`)?.focus();
  }, [order]);

  const numberOf = new Map<string, number>();
  let n = 1;
  for (const s of segments) {
    numberOf.set(s.key, n);
    n += s.pages.length;
  }
  const segment = (key: string) => segments.find((s) => s.key === key);

  const endDrag = () => {
    setDragging(null);
    setDropOn(null);
  };

  const groupKeys = (event: KeyboardEvent, clientId: string, index: number) => {
    if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const to = index + (event.key === "ArrowUp" ? -1 : 1);
    if (to < 0 || to >= groups.length) return;
    refocus.current = `group:${clientId}`;
    onMoveGroup(clientId, to);
  };
  const caseKeys = (event: KeyboardEvent, caseId: string, index: number, count: number) => {
    if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const to = index + (event.key === "ArrowUp" ? -1 : 1);
    if (to < 0 || to >= count) return;
    refocus.current = `case:${caseId}`;
    onMoveCase(caseId, to);
  };

  /** A locked row: the client's intro or closing, which follow its cases and never move. */
  const locked = (key: string, label: string) => {
    const s = segment(key);
    const first = s?.pages[0];
    return (
      <li key={key} data-locked={key} className="flex items-center gap-2.5 rounded-lg p-1.5 text-foreground-muted">
        <button type="button" onClick={() => onSelect(key)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left" title={copy.locked}>
          <span className="block w-[52px] shrink-0">
            {first !== undefined && s !== undefined ? (
              <Thumbnail formatId={formatId} template={s.template} page={first} number={numberOf.get(key) ?? 1} assets={assets} values={s.values} />
            ) : (
              <span aria-hidden="true" className={cn("block w-full rounded-md bg-surface-control", ASPECT[formatId])} />
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 truncate font-label text-[12.5px] font-medium text-foreground">
              <Lock aria-hidden="true" className="size-3 shrink-0" />
              {label}
            </span>
            <small className="truncate font-label text-[12px]">{pageCountLabel(s?.pages.length ?? 0)}</small>
          </span>
        </button>
        <span className="sr-only">{copy.locked}</span>
      </li>
    );
  };

  return (
    <div ref={root} className="flex flex-col gap-4">
      <span id={hintId} hidden>
        {copy.dragHint}
      </span>
      <ol className="flex flex-col gap-3">
        {groups.map((group, gi) => {
          const introShown = (segment(`client_intro:${group.clientId}`)?.pages.length ?? 0) > 0;
          const closingShown = (segment(`client_closing:${group.clientId}`)?.pages.length ?? 0) > 0;
          const groupDrop =
            dropOn === `group:${group.clientId}` && dragging?.kind === "group" && dragging.clientId !== group.clientId
              ? groups.findIndex((g) => g.clientId === dragging.clientId) > gi
                ? "before"
                : "after"
              : undefined;
          return (
            <li
              key={group.clientId}
              data-group={group.clientId}
              data-drop={groupDrop}
              onDragOver={(event) => {
                if (dragging?.kind !== "group" || !event.dataTransfer.types.includes(GROUP_DRAG_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dropOn !== `group:${group.clientId}`) setDropOn(`group:${group.clientId}`);
              }}
              onDrop={(event) => {
                if (dragging?.kind !== "group" || !event.dataTransfer.types.includes(GROUP_DRAG_TYPE)) return;
                event.preventDefault();
                const from = dragging.clientId;
                endDrag();
                if (from !== group.clientId) onMoveGroup(from, gi);
              }}
              className="rounded-xl bg-surface-raised/60 p-1.5 shadow-card data-[drop=after]:shadow-[0_3px_0_var(--color-accent)] data-[drop=before]:shadow-[0_-3px_0_var(--color-accent)]"
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-row={`group:${group.clientId}`}
                  draggable
                  aria-describedby={hintId}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  title={copy.dragHint}
                  onClick={() => onSelect(introShown ? `client_intro:${group.clientId}` : `case:${group.cases[0]?.caseId ?? ""}`)}
                  onKeyDown={(event) => groupKeys(event, group.clientId, gi)}
                  onDragStart={(event) => {
                    setDragging({ kind: "group", clientId: group.clientId });
                    event.dataTransfer.setData(GROUP_DRAG_TYPE, group.clientId);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={endDrag}
                  className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 rounded-md px-1 py-1 text-left active:cursor-grabbing"
                >
                  <GripVertical aria-hidden="true" className="size-3.5 shrink-0 text-foreground-muted" />
                  <span className={cn(EYEBROW, "mb-0 truncate")}>
                    <span className="sr-only">{fill(copy.group, { name: group.clientName })}</span>
                    <span aria-hidden="true">{group.clientName}</span>
                  </span>
                </button>
                <RowMenu
                  label={fill(copy.menu, { name: group.clientName })}
                  items={[
                    { label: copy.moveUp, disabled: gi === 0, onSelect: () => onMoveGroup(group.clientId, gi - 1) },
                    { label: copy.moveDown, disabled: gi === groups.length - 1, onSelect: () => onMoveGroup(group.clientId, gi + 1) },
                  ]}
                />
              </div>
              <ul className="mt-1 flex flex-col gap-1">
                {introShown && locked(`client_intro:${group.clientId}`, copy.intro)}
                {group.cases.map((c, ci) => {
                  const s = segment(`case:${c.caseId}`);
                  const first = s?.pages[0];
                  const available = c.part !== null;
                  const caseDrop =
                    dropOn === `case:${c.caseId}` && dragging?.kind === "case" && dragging.caseId !== c.caseId
                      ? group.cases.findIndex((x) => x.caseId === dragging.caseId) > ci
                        ? "before"
                        : "after"
                      : undefined;
                  const row: ReactNode = (
                    <li
                      key={c.caseId}
                      data-drop={caseDrop}
                      onDragOver={(event) => {
                        if (dragging?.kind !== "case" || !event.dataTransfer.types.includes(CASE_DRAG_TYPE)) return;
                        // Any case drag is taken, so a drop on another client's group reaches onDrop and is refused with why.
                        event.preventDefault();
                        event.stopPropagation();
                        const own = dragging.clientId === group.clientId;
                        event.dataTransfer.dropEffect = own ? "move" : "none";
                        if (own && dropOn !== `case:${c.caseId}`) setDropOn(`case:${c.caseId}`);
                      }}
                      onDrop={(event) => {
                        if (dragging?.kind !== "case" || !event.dataTransfer.types.includes(CASE_DRAG_TYPE)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        const from = dragging;
                        endDrag();
                        if (from.clientId !== group.clientId) {
                          onRefused(copy.otherGroup);
                          return;
                        }
                        if (from.caseId !== c.caseId) onMoveCase(from.caseId, ci);
                      }}
                      className="flex items-center gap-1 rounded-lg data-[drop=after]:shadow-[0_3px_0_var(--color-accent)] data-[drop=before]:shadow-[0_-3px_0_var(--color-accent)]"
                    >
                      <button
                        type="button"
                        data-row={`case:${c.caseId}`}
                        data-unavailable={available ? undefined : ""}
                        draggable
                        aria-describedby={hintId}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                        title={copy.dragHint}
                        onClick={() => onSelect(`case:${c.caseId}`)}
                        onKeyDown={(event) => caseKeys(event, c.caseId, ci, group.cases.length)}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          setDragging({ kind: "case", caseId: c.caseId, clientId: group.clientId });
                          event.dataTransfer.setData(CASE_DRAG_TYPE, c.caseId);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={endDrag}
                        className={cn(
                          "flex min-w-0 flex-1 cursor-grab items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors duration-150 hover:bg-surface-hover active:cursor-grabbing",
                          !available && "opacity-60",
                        )}
                      >
                        <span className="block w-[52px] shrink-0">
                          {first !== undefined && s !== undefined ? (
                            <Thumbnail formatId={formatId} template={s.template} page={first} number={numberOf.get(s.key) ?? 1} assets={assets} values={s.values} />
                          ) : (
                            <span aria-hidden="true" className={cn("block w-full rounded-md bg-surface-control", ASPECT[formatId])} />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-label text-[12.5px] font-medium text-foreground">{c.name}</span>
                          <small className="truncate font-label text-[12px] text-foreground-muted">
                            {available ? casePagesLabel(c.code, s?.pages.length ?? 0) : copy.unavailable}
                          </small>
                        </span>
                      </button>
                      <RowMenu
                        label={fill(copy.menu, { name: c.name })}
                        items={[
                          { label: copy.moveUp, disabled: ci === 0, onSelect: () => onMoveCase(c.caseId, ci - 1) },
                          { label: copy.moveDown, disabled: ci === group.cases.length - 1, onSelect: () => onMoveCase(c.caseId, ci + 1) },
                          { label: copy.remove, danger: true, onSelect: () => onRemove(c.caseId) },
                        ]}
                      />
                    </li>
                  );
                  return row;
                })}
                {closingShown && locked(`client_closing:${group.clientId}`, copy.closing)}
              </ul>
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={onAdd} className={cn(SECONDARY_ACTION, "w-full")}>
        <Plus aria-hidden="true" className="size-4" />
        {it.collection.add.button}
      </button>
    </div>
  );
}
