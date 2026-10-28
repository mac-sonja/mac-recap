import { connection } from "next/server";
import { MacWordmark } from "@/app/_components/mac-wordmark";
import { it } from "@/shared/i18n/it";

/**
 * Sign-in, sign-up and password screens: no shell, one centred card on the page
 * surface, the MAC wordmark above it. Rendered per request (they read the session).
 */
export default async function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-surface px-4 py-12 text-foreground">
      <p className="flex items-end gap-2 text-foreground-strong">
        <MacWordmark label={it.app.name} className="h-[26px] w-auto" />
        <span aria-hidden="true" className="font-label text-xs leading-none font-semibold tracking-[0.18em]">
          {it.app.wordmarkSuffix}
        </span>
      </p>
      <div className="w-full max-w-[400px]">{children}</div>
    </main>
  );
}
