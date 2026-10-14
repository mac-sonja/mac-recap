import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import "./globals.css";

/** Inter for the tool UI, JetBrains Mono for IDs, sizes and readouts (DESIGN.md Typography). */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: it.app.name,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={cn(inter.variable, jetbrainsMono.variable)}>
      <body className="bg-surface font-body text-foreground antialiased">{children}</body>
    </html>
  );
}
