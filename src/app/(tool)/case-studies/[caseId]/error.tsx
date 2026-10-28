"use client";

import Link from "next/link";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import { it } from "@/shared/i18n/it";

/**
 * The approved case page's error boundary: a failed load (anything but `NOT_FOUND`, which
 * redirects) shows an Italian message and a way back to Case studies inside the tool
 * shell, instead of Next's default page. The tool layout already provides the `<main>`.
 */
export default function CaseViewError() {
  return (
    <div className="flex flex-col items-start gap-4">
      <p role="alert" className="max-w-prose font-body text-base text-foreground">
        {it.wizard.loadFailed}
      </p>
      <Link href="/case-studies" className={SECONDARY_ACTION}>
        {it.wizard.back}
      </Link>
    </div>
  );
}
