/** The person's theme choice: follow the system, or a fixed light or dark theme. */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

/** The cookie that keeps the choice, read by the root layout so the first paint is already right. */
export const THEME_COOKIE = "mac-theme";

/** A cookie value as a choice; anything unknown follows the system. */
export function parseTheme(value: string | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}
