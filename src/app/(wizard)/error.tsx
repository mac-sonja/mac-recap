"use client";

import Link from "next/link";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import { it } from "@/shared/i18n/it";

/**
 * The wizard's error boundary: a failed case lookup (anything but `NOT_FOUND`) shows
 * an Italian message and a way back to Case studies instead of Next's default page.
 */
export default function WizardError() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-surface p-8">
      <p role="alert" className="max-w-prose font-body text-base text-foreground">
        {it.wizard.loadFailed}
      </p>
      <Link href="/case-studies" className={SECONDARY_ACTION}>
        {it.wizard.back}
      </Link>
    </main>
  );
}
