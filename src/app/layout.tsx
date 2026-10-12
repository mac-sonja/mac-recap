import type { Metadata } from "next";
import { it } from "@/shared/i18n/it";
import "./globals.css";

export const metadata: Metadata = {
  title: it.app.name,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="bg-surface font-body text-foreground antialiased">{children}</body>
    </html>
  );
}
