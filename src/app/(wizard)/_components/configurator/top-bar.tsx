"use client";

import { ArrowLeft, Eye, Pencil, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useId, type Ref } from "react";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { StatusBadge } from "@/app/_components/status-badge";
import type { CaseStatus } from "@/modules/access";
import { FORMATS, type FormatId } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { ICON_BUTTON, SEG, SEG_BUTTON, SOON_ID } from "./styles";

/**
 * What the top bar shows of the document being edited. Neutral, so a client's intro
 * (4.11) or file (4.12) can fill it too: the frame below makes no case-only assumption.
 */
export interface ConfiguratorHeader {
  name: string;
  code: string;
  status: CaseStatus;
}

export interface TopBarProps {
  header: ConfiguratorHeader;
  back: { href: string; label: string };
  formatId: FormatId;
  onFormat: (formatId: FormatId) => void;
  /** A tool of a later story was pressed: its name, for the canvas message. */
  onSoon: (tool: string) => void;
  /** In Anteprima (C37). */
  preview: boolean;
  onPreview: (on: boolean) => void;
  /** The eye/pencil button, for focus to land on when Esc leaves Anteprima. */
  previewRef?: Ref<HTMLButtonElement>;
  /** The autosave's state (Story 4.3a). */
  save: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /**
   * **Approva** (Story 4.8): `blocker` names what's left (an overflowing page, a missing
   * file) and makes it inactive (still focusable, so the reason can be read); undefined
   * while it can't apply (trial pages, an approved case).
   */
  approval?: { blocker: string | null; pending: boolean; onApprove: () => void };
  /**
   * Story 4.9: an Approvato case. **Approva** never shows; while a copy is pending, `update`
   * shows **Scarta le modifiche** and **Aggiorna la versione approvata** (inactive with
   * `blocker`, as Approva); without one, nothing does.
   */
  approvedCase?: boolean;
  update?: { blocker: string | null; pending: boolean; onUpdate: () => void; onDiscard: () => void };
}

/** *Salvato*, *Salvataggio…*, or *Non salvato. Nuovo tentativo…* after a failed save. */
export type SaveState = "saved" | "saving" | "retrying";

const SAVE_LABEL: Readonly<Record<SaveState, string>> = {
  saved: it.configurator.saved,
  saving: it.configurator.saving,
  retrying: it.configurator.retrying,
};

/** The top bar's left side: back, name, code and status badge. */
export function DocumentHeading({ header, back }: Pick<TopBarProps, "header" | "back">) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href={back.href}
        aria-label={back.label}
        className="grid size-8 shrink-0 place-items-center rounded-full text-foreground transition-[background-color,transform] duration-150 hover:bg-surface-hover active:scale-[0.94]"
      >
        <ArrowLeft aria-hidden="true" className="size-[18px]" />
      </Link>
      <span className="ml-1 min-w-0 truncate font-label text-sm font-semibold text-foreground-strong">{header.name}</span>
      <span className="shrink-0 font-mono text-xs text-foreground-muted">
        <span className="sr-only">{`${it.configurator.codeLabel} `}</span>
        {header.code}
      </span>
      <StatusBadge status={header.status} className="shrink-0" />
    </div>
  );
}

/** The format switch, one segment per registry format with its ratio. Shared with an approved case's page (Story 5.2). */
export function FormatSwitch({ formatId, onFormat }: Pick<TopBarProps, "formatId" | "onFormat">) {
  return (
    <div role="group" aria-label={it.configurator.formats.label} className={SEG}>
      {FORMATS.map((format) => (
        <button key={format.id} type="button" aria-pressed={format.id === formatId} onClick={() => onFormat(format.id)} className={SEG_BUTTON}>
          {it.configurator.formats[format.id]}
          <small className="font-mono text-[11.5px] font-normal text-foreground-muted">{format.ratio}</small>
        </button>
      ))}
    </div>
  );
}

/**
 * The configurator's top bar (mockup `.top`): back, name, code and status badge on the
 * left; the format switch and the Anteprima eye in the centre (a pencil, *Torna
 * all’editor*, while in Anteprima); the save state, undo, redo and **Approva** on the
 * right. The save state follows the autosave (Story 4.3a); undo and redo are disabled
 * with nothing to undo or redo. **Approva** (Story 4.8) is active once nothing overflows
 * and no file is missing; without an approval to make it shows, inactive, and says it
 * arrives soon when pressed. On an Approvato case (Story 4.9) it never shows: a pending copy
 * gets **Scarta le modifiche** and **Aggiorna la versione approvata** instead.
 */
export function TopBar({
  header,
  back,
  formatId,
  onFormat,
  onSoon,
  preview,
  onPreview,
  previewRef,
  save,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  approval,
  approvedCase = false,
  update,
}: TopBarProps) {
  const approvalReasonId = useId();
  const updateReasonId = useId();
  const previewLabel = preview ? it.configurator.preview.leave : it.configurator.preview.enter;
  return (
    <header
      className={cn(
        "grid h-14 shrink-0 items-center gap-4 border-b border-border bg-surface-sidebar px-3",
        // Scarta and Aggiorna (Story 4.9) are wider than Approva: the right side takes its width and the name truncates.
        update === undefined ? "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_auto_auto]",
      )}
    >
      <DocumentHeading header={header} back={back} />

      <div className="flex items-center gap-2">
        <FormatSwitch formatId={formatId} onFormat={onFormat} />
        {/* Anteprima: an eye; in Anteprima the same button is a pencil back to the editor (mockup `#previewBtn`). */}
        <button
          ref={previewRef}
          type="button"
          aria-pressed={preview}
          aria-label={previewLabel}
          title={previewLabel}
          onClick={() => onPreview(!preview)}
          className={cn(
            ICON_BUTTON,
            "size-8 bg-surface-raised text-foreground shadow-control aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary-hover",
          )}
        >
          {preview ? <Pencil aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </button>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        <span
          aria-live="polite"
          data-save-state={save}
          className={cn("mr-1 truncate font-label text-[12.5px] text-foreground-muted", save === "retrying" && "text-danger")}
        >
          {SAVE_LABEL[save]}
        </span>
        <button
          type="button"
          disabled={!canUndo}
          aria-label={it.configurator.undo}
          aria-keyshortcuts="Meta+Z Control+Z"
          title={it.configurator.undoHint}
          onClick={onUndo}
          className={cn(ICON_BUTTON, "disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground-muted")}
        >
          <Undo2 aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          disabled={!canRedo}
          aria-label={it.configurator.redo}
          aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z"
          title={it.configurator.redoHint}
          onClick={onRedo}
          className={cn(ICON_BUTTON, "disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground-muted")}
        >
          <Redo2 aria-hidden="true" className="size-4" />
        </button>
        {approvedCase ? (
          update !== undefined && (
            <>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-strong" />
              <button
                type="button"
                disabled={update.pending}
                onClick={update.onDiscard}
                className={cn(SECONDARY_ACTION, "shrink-0 disabled:opacity-50")}
              >
                {it.configurator.approvedEdit.discard}
              </button>
              {/* What's left before updating, as for Approva (Story 4.8). */}
              {update.blocker !== null && (
                <span id={updateReasonId} className="sr-only">
                  {update.blocker}
                </span>
              )}
              <button
                type="button"
                aria-disabled={update.blocker !== null || update.pending ? "true" : undefined}
                aria-describedby={update.blocker !== null ? updateReasonId : undefined}
                title={update.blocker ?? undefined}
                onClick={() => {
                  if (update.blocker === null && !update.pending) update.onUpdate();
                }}
                className={cn(PRIMARY_ACTION, "shrink-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-50")}
              >
                {it.configurator.approvedEdit.update}
              </button>
            </>
          )
        ) : (
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-strong" />
        )}
        {approvedCase ? null : approval === undefined ? (
          <button
            type="button"
            aria-disabled="true"
            aria-describedby={SOON_ID}
            title={it.configurator.soon}
            onClick={() => onSoon(it.configurator.approve)}
            className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, "cursor-default")}
          >
            {it.configurator.approve}
          </button>
        ) : (
          <>
            {/* What's left before approving (Story 4.8): named for assistive tech and as the button's hint. */}
            {approval.blocker !== null && (
              <span id={approvalReasonId} className="sr-only">
                {approval.blocker}
              </span>
            )}
            <button
              type="button"
              aria-disabled={approval.blocker !== null || approval.pending ? "true" : undefined}
              aria-describedby={approval.blocker !== null ? approvalReasonId : undefined}
              title={approval.blocker ?? undefined}
              onClick={() => {
                if (approval.blocker === null && !approval.pending) approval.onApprove();
              }}
              className={cn(PRIMARY_ACTION, "aria-disabled:cursor-not-allowed aria-disabled:opacity-50")}
            >
              {it.configurator.approve}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
