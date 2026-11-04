"use client";

import { Download, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { PRESSABLE, PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, ROW_PILL, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import type { FormatId } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/**
 * The formats the picker offers today, in its order (SCP 2026-10-28). Video is
 * Anteprima only for the demo, so it stays under *In arrivo* (answer 1).
 */
const FORMAT_ORDER = ["presentazione_16_9", "carosello_1_1"] as const satisfies readonly FormatId[];
type DownloadFormatId = (typeof FORMAT_ORDER)[number];

const UPCOMING = Object.values(it.download.upcoming);

const OPTION = "flex items-center gap-3 rounded-lg border px-4 py-3";

/** How often a file being made is asked about (Story 5.3). */
export const DOWNLOAD_POLL_MS = 2000;

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
   * Asks for the chosen format's file (Story 5.3: one case; 5.9 wires the client pack).
   * Without it **Scarica** in the dialog stays inactive.
   */
  onDownload?: (format: FormatId) => Promise<DownloadStart>;
  /** Asks again about a `pending` ticket, every 2 s until it is ready or failed. */
  onPoll?: (ticket: string) => Promise<DownloadPoll>;
}

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "working"; ticket: string; format: DownloadFormatId }
  | { kind: "failed"; format: DownloadFormatId };

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
 * radio choices (Presentazione first); the ones still to come are listed greyed out
 * with *In arrivo*. Shown only where there is something approved to download.
 *
 * Story 5.3: **Scarica** in the dialog asks for the file. A refusal (no approved
 * version, a format the version lacks) shows in the dialog. Otherwise the dialog closes
 * and the pill shows *Preparo il file…* while the worker makes it; the person can keep
 * browsing. When it is ready the browser downloads it; when it didn't finish a toast
 * offers **Riprova**. Leaving the page drops the wait: no download then.
 */
export function DownloadButton({ label, title, description, onDownload, onPoll }: DownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<DownloadFormatId>(FORMAT_ORDER[0]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [refusal, setRefusal] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const name = useId();
  const refusalId = useId();

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

  async function begin(chosen: DownloadFormatId) {
    const start = handlers.current.onDownload;
    if (start === undefined || busy) return;
    setPhase({ kind: "starting" });
    setRefusal(null);
    setAnnouncement("");
    let started: DownloadStart;
    try {
      started = await start(chosen);
    } catch {
      started = { kind: "refused", message: it.download.failed };
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
      setPhase({ kind: "working", ticket: started.ticket, format: chosen });
    }
  }

  useEffect(() => {
    if (phase.kind !== "working") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const poll = handlers.current.onPoll;
      let next: DownloadPoll;
      try {
        next = poll === undefined ? { kind: "failed" } : await poll(phase.ticket);
      } catch {
        next = { kind: "failed" };
      }
      if (cancelled) return;
      if (next.kind === "pending") {
        timer = setTimeout(tick, DOWNLOAD_POLL_MS);
        return;
      }
      if (next.kind === "ready") {
        saveFile(next.url, next.fileName);
        setPhase({ kind: "idle" });
        setAnnouncement(it.download.ready);
      } else {
        setPhase({ kind: "failed", format: phase.format });
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
          setOpen(true);
        }}
        className={cn(ROW_PILL, PRESSABLE, "aria-busy:text-foreground-muted")}
      >
        {phase.kind === "working" ? (
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
      {(phase.kind === "working" || announcement !== "") && (
        <span role="status" className="sr-only">
          {phase.kind === "working" ? it.download.working : announcement}
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
              onClick={() => void begin(format)}
              aria-disabled={onDownload === undefined || busy ? "true" : undefined}
              aria-busy={phase.kind === "starting" ? "true" : undefined}
              className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE)}
            >
              <Download aria-hidden="true" className="size-4" />
              {it.download.action}
            </button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-2" aria-describedby={refusal === null ? undefined : refusalId}>
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
                type="radio"
                name={name}
                value={id}
                checked={format === id}
                onChange={() => {
                  setFormat(id);
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
              <input type="radio" disabled name={name} className="size-4 shrink-0" />
              <span className="font-label text-sm">{label}</span>
              <span className="ml-auto rounded-md bg-surface-control px-2 py-0.5 font-label text-badge font-medium">{it.download.soon}</span>
            </div>
          ))}
        </fieldset>
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
          <p className="font-label text-sm text-foreground-strong">{it.download.failed}</p>
          <button type="button" onClick={() => void begin(phase.format)} className={SECONDARY_ACTION}>
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
