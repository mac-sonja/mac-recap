"use client";

import { Download, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { PRESSABLE, PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, ROW_PILL, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { EXPORT_FORMAT_IDS, isExportFormatId, type ExportFormatId, type FormatId } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/**
 * The formats the picker offers today, in its order (SCP 2026-10-28). Video is
 * Anteprima only for the demo, so it stays under *In arrivo* (answer 1).
 */
const FORMAT_ORDER: readonly ExportFormatId[] = EXPORT_FORMAT_IDS;

/** The boxes ticked when the dialog opens: the format in view, else Presentazione (Story 5.4). */
const defaultTicked = (current: FormatId | undefined): ExportFormatId[] => [current !== undefined && isExportFormatId(current) ? current : FORMAT_ORDER[0]];

/** The ticked formats in the picker's order. */
const inOrder = (ticked: readonly ExportFormatId[]) => FORMAT_ORDER.filter((id) => ticked.includes(id));

const UPCOMING = Object.values(it.download.upcoming);

const OPTION = "flex items-center gap-3 rounded-lg border px-4 py-3";

/** How often a file being made is asked about (Story 5.3). */
export const DOWNLOAD_POLL_MS = 2000;

/** How long a file may stay pending before the wait counts as not finished (the toast with **Riprova**). */
export const DOWNLOAD_GIVE_UP_MS = 5 * 60 * 1000;

/** What **Scarica** in the dialog gets back at once: the file, a ticket to poll, or why not (shown in the dialog). */
export type DownloadStart =
  | { kind: "ready"; url: string; fileName: string }
  | { kind: "pending"; ticket: string }
  | { kind: "refused"; message: string };

/** A poll's answer: the file, still working, or it didn't finish (the toast with **Riprova**). */
export type DownloadPoll = { kind: "ready"; url: string; fileName: string } | { kind: "pending" } | { kind: "failed" };

export interface DownloadButtonProps {
  /** The trigger's accessible name, e.g. "Scarica il pack di Fornaci Brera". */
  label: string;
  /** The dialog's title and the line under it. */
  title: string;
  description: string;
  /**
   * Asks for the ticked formats' file, in the picker's order (Story 5.3: one format, its
   * own file; 5.4: two or more, one ZIP; 5.9a: a client's pack). Without it
   * **Scarica** in the dialog stays inactive.
   */
  onDownload?: (formats: ExportFormatId[]) => Promise<DownloadStart>;
  /** Asks again about a `pending` ticket, every 2 s until it is ready or failed (at most 5 minutes). */
  onPoll?: (ticket: string) => Promise<DownloadPoll>;
  /** The failure toast's line, naming what was downloaded (several toasts may show at once). */
  failedMessage?: string;
  /** The format shown in the view, ticked when the dialog opens; without one (a table row), Presentazione is. */
  currentFormat?: FormatId;
  /** A line under the formats (Story 5.9a: a client pack whose intro isn't approved). */
  note?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "working"; ticket: string; formats: ExportFormatId[] }
  | { kind: "failed"; formats: ExportFormatId[] };

/** Hands a signed link to the browser's downloads; the link itself says "attachment" and names the file. */
function saveFile(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * **Scarica**: a small grey pill that opens the format picker. Today's formats are
 * checkboxes (Presentazione first), the format in view ticked when it opens; the ones
 * still to come are listed greyed out with *In arrivo*. Shown only where there is
 * something approved to download.
 *
 * Story 5.4: one ticked format downloads its own file, two or more one ZIP; with none
 * ticked **Scarica** in the dialog is inactive.
 *
 * Story 5.3: **Scarica** in the dialog asks for the file. A refusal (no approved
 * version, a format the version lacks) shows in the dialog. Otherwise the dialog closes
 * and the pill shows *Preparo il file…* while the worker makes it; the person can keep
 * browsing. When it is ready the browser downloads it; when it didn't finish a toast
 * offers **Riprova**. Leaving the page drops the wait: no download then.
 */
export function DownloadButton({
  label,
  title,
  description,
  onDownload,
  onPoll,
  failedMessage = it.download.failed,
  currentFormat,
  note,
}: DownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<ExportFormatId[]>(() => defaultTicked(currentFormat));
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [refusal, setRefusal] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const refusalId = useId();
  const noteId = useId();
  const hasNote = note !== undefined && note !== "";
  const describedBy = [hasNote ? noteId : null, refusal === null ? null : refusalId].filter((id) => id !== null).join(" ");

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The latest handlers, so a parent re-render never restarts the 2 s wait.
  const handlers = useRef({ onDownload, onPoll });
  useEffect(() => {
    handlers.current = { onDownload, onPoll };
  });

  const busy = phase.kind === "starting" || phase.kind === "working";
  // A double click lands before the re-render that marks the button busy.
  const inFlight = useRef(false);

  async function begin(chosen: readonly ExportFormatId[]) {
    const start = handlers.current.onDownload;
    if (start === undefined || chosen.length === 0 || busy || inFlight.current) return;
    inFlight.current = true;
    setPhase({ kind: "starting" });
    setRefusal(null);
    setAnnouncement("");
    let started: DownloadStart;
    try {
      started = await start(inOrder(chosen));
    } catch {
      started = { kind: "refused", message: it.download.failed };
    } finally {
      inFlight.current = false;
    }
    if (!mounted.current) return;
    if (started.kind === "refused") {
      setPhase({ kind: "idle" });
      setRefusal(started.message);
      setOpen(true);
      return;
    }
    setOpen(false);
    if (started.kind === "ready") {
      saveFile(started.url, started.fileName);
      setPhase({ kind: "idle" });
      setAnnouncement(it.download.ready);
    } else {
      setPhase({ kind: "working", ticket: started.ticket, formats: inOrder(chosen) });
    }
  }

  useEffect(() => {
    if (phase.kind !== "working") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUpAt = Date.now() + DOWNLOAD_GIVE_UP_MS;
    const tick = async () => {
      const poll = handlers.current.onPoll;
      let next: DownloadPoll;
      try {
        next = poll === undefined ? { kind: "failed" } : await poll(phase.ticket);
      } catch {
        next = { kind: "failed" };
      }
      if (cancelled) return;
      if (next.kind === "pending" && Date.now() < giveUpAt) {
        timer = setTimeout(tick, DOWNLOAD_POLL_MS);
        return;
      }
      if (next.kind === "ready") {
        saveFile(next.url, next.fileName);
        setPhase({ kind: "idle" });
        setAnnouncement(it.download.ready);
      } else {
        setPhase({ kind: "failed", formats: phase.formats });
      }
    };
    timer = setTimeout(tick, DOWNLOAD_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase]);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-busy={busy ? "true" : undefined}
        aria-disabled={busy ? "true" : undefined}
        onClick={() => {
          if (busy) return;
          setRefusal(null);
          setTicked(defaultTicked(currentFormat));
          setOpen(true);
        }}
        className={cn(ROW_PILL, PRESSABLE, "aria-busy:text-foreground-muted")}
      >
        {busy ? (
          <>
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
            {it.download.working}
          </>
        ) : (
          <>
            <Download aria-hidden="true" className="size-3.5" />
            {it.download.action}
          </>
        )}
      </button>
      {/* Only while there is something to say: a table holds one picker per row. */}
      {(busy || announcement !== "") && (
        <span role="status" className="sr-only">
          {busy ? it.download.working : announcement}
        </span>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        closeLabel={it.download.close}
        actions={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cn("inline-flex h-9 items-center rounded-full px-4 font-label text-sm font-medium text-foreground hover:bg-surface-hover", PRESSABLE)}
            >
              {it.download.cancel}
            </button>
            <button
              type="button"
              onClick={() => void begin(ticked)}
              aria-disabled={onDownload === undefined || ticked.length === 0 || busy ? "true" : undefined}
              aria-busy={phase.kind === "starting" ? "true" : undefined}
              className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE)}
            >
              <Download aria-hidden="true" className="size-4" />
              {it.download.action}
            </button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-2" aria-describedby={describedBy === "" ? undefined : describedBy}>
          <legend className="sr-only">{it.download.formats}</legend>
          {FORMAT_ORDER.map((id) => (
            <label
              key={id}
              className={cn(
                OPTION,
                "cursor-pointer border-border bg-surface-raised transition-colors duration-150 hover:bg-surface-hover has-checked:border-foreground-strong has-checked:ring-1 has-checked:ring-foreground-strong",
              )}
            >
              <input
                type="checkbox"
                value={id}
                checked={ticked.includes(id)}
                onChange={(event) => {
                  const on = event.currentTarget.checked;
                  setTicked((current) => (on ? inOrder([...current, id]) : current.filter((f) => f !== id)));
                  setRefusal(null);
                }}
                className="size-4 shrink-0 accent-foreground-strong"
              />
              <span className="flex flex-col">
                <span className="font-label text-sm font-semibold text-foreground-strong">{it.download.format[id].name}</span>
                <span className="font-label text-xs text-foreground-muted">{it.download.format[id].hint}</span>
              </span>
            </label>
          ))}
          {UPCOMING.map((label) => (
            <div key={label} aria-disabled="true" className={cn(OPTION, "border-border/60 text-foreground-muted opacity-70")}>
              <input type="checkbox" disabled className="size-4 shrink-0" />
              <span className="font-label text-sm">{label}</span>
              <span className="ml-auto rounded-md bg-surface-control px-2 py-0.5 font-label text-badge font-medium">{it.download.soon}</span>
            </div>
          ))}
        </fieldset>
        {hasNote && (
          <p id={noteId} className="mt-3 font-label text-sm text-foreground-muted">
            {note}
          </p>
        )}
        {refusal !== null && (
          <p id={refusalId} role="alert" className="mt-3 font-label text-sm text-danger">
            {refusal}
          </p>
        )}
      </Dialog>
      {phase.kind === "failed" && (
        <div
          role="alert"
          className="fixed right-6 bottom-6 z-50 flex animate-enter items-center gap-3 rounded-xl bg-surface-raised py-3 pr-3 pl-4 shadow-popover"
        >
          <p className="font-label text-sm text-foreground-strong">{failedMessage}</p>
          <button type="button" onClick={() => void begin(phase.formats)} className={SECONDARY_ACTION}>
            {it.download.retry}
          </button>
          <button
            type="button"
            aria-label={it.download.close}
            onClick={() => setPhase({ kind: "idle" })}
            className={cn("inline-flex size-8 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-hover", PRESSABLE)}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
