import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { PRESSABLE } from "@/app/_components/button-styles";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/**
 * The person using the tool (sidebar footer): an initial in a dark disc, their
 * name and role, and **Esci**, which ends the session and returns to sign-in
 * (Story 6.1). Collapsed to the initial and the exit icon below 1280 px, with the
 * name kept for screen readers.
 */
export function UserMenu({ displayName, roleLabel }: { displayName: string; roleLabel: string }) {
  const initial = displayName.trim().charAt(0).toLocaleUpperCase("it-IT") || "?";
  return (
    <div className="flex flex-col items-center gap-2 px-1 xl:flex-row xl:gap-2.5">
      <span
        aria-hidden="true"
        title={displayName}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground-strong font-label text-xs font-semibold text-surface"
      >
        {initial}
      </span>
      <span className="sr-only min-w-0 flex-1 flex-col xl:not-sr-only xl:flex">
        <span className="truncate font-label text-sm leading-tight font-medium text-foreground">{displayName}</span>
        <span className="truncate font-label text-xs leading-tight text-foreground-muted">{roleLabel}</span>
      </span>
      <form action={signOutAction}>
        <button
          type="submit"
          title={it.shell.userMenu.signOut}
          aria-label={it.shell.userMenu.signOut}
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-hover hover:text-foreground",
            PRESSABLE,
          )}
        >
          <LogOut aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </form>
    </div>
  );
}
