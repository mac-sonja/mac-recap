"use client";

import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
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
}

/**
 * The configurator's top bar (mockup `.top`): back, name, code and status badge on the
 * left; the format switch in the centre; the save state, undo, redo and **Approva** on
 * the right. Undo, redo and **Approva** arrive with Stories 4.3 and 4.8: they show,
 * inactive, and say so when pressed. Nothing is saved yet, so the state reads *Salvato*.
 */
export function TopBar({ header, back, formatId, onFormat, onSoon }: TopBarProps) {
  return (
    <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-border bg-surface-sidebar px-3">
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

      <div role="group" aria-label={it.configurator.formats.label} className={SEG}>
        {FORMATS.map((format) => (
          <button
            key={format.id}
            type="button"
            aria-pressed={format.id === formatId}
            onClick={() => onFormat(format.id)}
            className={SEG_BUTTON}
          >
            {it.configurator.formats[format.id]}
            <small className="font-mono text-[11.5px] font-normal text-foreground-muted">{format.ratio}</small>
          </button>
        ))}
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        <span className="mr-1 font-label text-[12.5px] text-foreground-muted">{it.configurator.saved}</span>
        <button
          type="button"
          aria-disabled="true"
          aria-label={it.configurator.undo}
          aria-describedby={SOON_ID}
          title={it.configurator.soon}
          onClick={() => onSoon(it.configurator.undo)}
          className={ICON_BUTTON}
        >
          <Undo2 aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-disabled="true"
          aria-label={it.configurator.redo}
          aria-describedby={SOON_ID}
          title={it.configurator.soon}
          onClick={() => onSoon(it.configurator.redo)}
          className={ICON_BUTTON}
        >
          <Redo2 aria-hidden="true" className="size-4" />
        </button>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-strong" />
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
      </div>
    </header>
  );
}
