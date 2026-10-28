"use client";

import { Download } from "lucide-react";
import { useId, useState } from "react";
import { PRESSABLE, PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
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

export interface DownloadButtonProps {
  /** The trigger's accessible name, e.g. "Scarica il pack di Fornaci Brera". */
  label: string;
  /** The dialog's title and the line under it. */
  title: string;
  description: string;
  /**
   * Makes the file for the chosen format. Stories 5.3 (one case) and 5.9 (client
   * pack) wire it; until then **Scarica** in the dialog stays inactive.
   */
  onDownload?: (format: FormatId) => void;
}

/**
 * **Scarica**: a small grey pill that opens the format picker. Today's formats are
 * radio choices (Presentazione first); the ones still to come are listed greyed out
 * with *In arrivo*. Shown only where there is something approved to download.
 */
export function DownloadButton({ label, title, description, onDownload }: DownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<DownloadFormatId>(FORMAT_ORDER[0]);
  const name = useId();

  function download() {
    if (onDownload === undefined) return;
    onDownload(format);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-control px-3 font-label text-[13px] font-medium whitespace-nowrap text-foreground hover:bg-surface-selected",
          PRESSABLE,
        )}
      >
        <Download aria-hidden="true" className="size-3.5" />
        {it.download.action}
      </button>
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
              onClick={download}
              aria-disabled={onDownload === undefined ? "true" : undefined}
              className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE)}
            >
              <Download aria-hidden="true" className="size-4" />
              {it.download.action}
            </button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-2">
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
                onChange={() => setFormat(id)}
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
      </Dialog>
    </>
  );
}
