"use client";

import { CircleUser } from "lucide-react";
import { useId, useRef, useState } from "react";
import { it } from "@/shared/i18n/it";

/**
 * The actor's display name and role label behind a disclosure button.
 * No sign-out until Epic 6 (absent, not disabled). Escape closes and returns focus.
 */
export function UserMenu({ displayName, roleLabel }: { displayName: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <div
        id={panelId}
        hidden={!open}
        className="absolute bottom-full left-0 z-10 mb-2 w-56 rounded-lg border bg-surface-raised p-3"
      >
        <p className="font-body text-sm text-foreground">{displayName}</p>
        <p className="font-label text-xs text-foreground-muted">{roleLabel}</p>
      </div>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        title={it.shell.userMenu.button}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-center gap-3 rounded-md px-3 py-2 font-label text-sm text-foreground-muted hover:bg-surface-control hover:text-foreground xl:justify-start"
      >
        <CircleUser aria-hidden="true" className="size-5 shrink-0" />
        <span className="sr-only xl:not-sr-only">{it.shell.userMenu.button}</span>
      </button>
    </div>
  );
}
