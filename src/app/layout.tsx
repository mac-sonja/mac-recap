import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/app/_lib/theme";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import "./globals.css";

/** Inter for the tool UI, JetBrains Mono for IDs, sizes and readouts (DESIGN.md Typography). */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: it.app.name,
};

/**
 * The document. A light or dark choice from the sidebar is kept in a cookie and set
 * here as `data-theme`, so the first paint is already right; without one the
 * theme follows the system (globals.css).
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="it"
      data-theme={theme === "system" ? undefined : theme}
      className={cn(inter.variable, jetbrainsMono.variable)}
    >
      <body className="bg-surface font-body text-foreground antialiased">{children}</body>
    </html>
  );
}
