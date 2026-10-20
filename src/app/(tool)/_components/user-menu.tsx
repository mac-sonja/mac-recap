/**
 * The person using the tool: an initial in a dark disc, their name and role
 * (sidebar footer). Static until sign-out arrives in Epic 6: a menu with nothing
 * in it would only add a click. Collapsed to the initial below 1280 px, with the
 * name kept for screen readers.
 */
export function UserMenu({ displayName, roleLabel }: { displayName: string; roleLabel: string }) {
  const initial = displayName.trim().charAt(0).toLocaleUpperCase("it-IT") || "?";
  return (
    <div className="flex items-center justify-center gap-2.5 px-1 xl:justify-start" title={displayName}>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground-strong font-label text-xs font-semibold text-surface"
      >
        {initial}
      </span>
      <span className="sr-only min-w-0 flex-col xl:not-sr-only xl:flex">
        <span className="truncate font-label text-sm leading-tight font-medium text-foreground">{displayName}</span>
        <span className="truncate font-label text-xs leading-tight text-foreground-muted">{roleLabel}</span>
      </span>
    </div>
  );
}
