"use client";

import { Contrast, Moon, Sun, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { THEME_CHOICES, THEME_COOKIE, type ThemeChoice } from "@/app/_lib/theme";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

const ICON: Readonly<Record<ThemeChoice, LucideIcon>> = { system: Contrast, light: Sun, dark: Moon };

/** One year: the choice is a preference, not a session. */
const MAX_AGE = 60 * 60 * 24 * 365;

/** Applies a choice to the open page and keeps it for the next request (read by the root layout). */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

/**
 * The appearance switch at the bottom of the sidebar: Automatico (follows the
 * system), Chiaro, Scuro, as a radiogroup of icon segments. The switch is instant:
 * no animation on something people toggle on purpose and want to see right away.
 * Vertical when the sidebar is collapsed to icons (below 1280 px).
 */
export function ThemeSwitch({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);

  function pick(next: ThemeChoice) {
    setChoice(next);
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={it.shell.theme.label}
      className="flex w-fit flex-col gap-0.5 self-center rounded-full bg-surface-control p-[3px] xl:flex-row xl:self-start"
    >
      {THEME_CHOICES.map((value) => {
        const Icon = ICON[value];
        const checked = value === choice;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={it.shell.theme[value]}
            title={it.shell.theme[value]}
            onClick={() => pick(value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-foreground-muted transition-colors duration-150 hover:text-foreground",
              checked && "bg-surface-raised text-foreground shadow-control",
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
