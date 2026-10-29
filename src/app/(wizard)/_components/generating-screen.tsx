"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import { GENERATING_REFRESH_MS } from "@/shared/case-status";
import { it } from "@/shared/i18n/it";

const copy = it.wizard.generate.waiting;

/**
 * Wizard step 3 while the case is In elaborazione (Story 3.7b): what is happening and a way
 * back to the list. No ETA, percentage or progress bar. It asks the server again every
 * few seconds, so when the case leaves `generating` the page follows its usual rules
 * (done: the list; failed: the draft's step 3 with the failure).
 */
export function GeneratingScreen() {
  const router = useRouter();
  const refresh = useRef(router.refresh);
  useEffect(() => {
    refresh.current = router.refresh;
  });
  useEffect(() => {
    const timer = setInterval(() => refresh.current(), GENERATING_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div role="status" className="flex flex-col items-start gap-3">
      <Loader2 aria-hidden="true" className="size-6 animate-spin text-foreground-muted motion-reduce:animate-none" />
      <h2 className="font-display text-xl font-semibold text-foreground-strong">{copy.heading}</h2>
      <p className="max-w-prose font-body text-sm text-foreground-muted">{copy.body}</p>
      <Link href="/case-studies" className={`${SECONDARY_ACTION} mt-3`}>
        {it.wizard.back}
      </Link>
    </div>
  );
}
