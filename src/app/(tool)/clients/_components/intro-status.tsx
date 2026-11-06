"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import { StatusBadge } from "@/app/_components/status-badge";
import type { CaseStatus } from "@/modules/access";
import { GENERATING_REFRESH_MS } from "@/shared/case-status";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/**
 * The client's intro status on its page (Story 3.11): "Introduzione:" and the status badge
 * (the case badge's hues). While the intro is In elaborazione the page asks the server
 * again every few seconds, and stops once it is not. A polite status region, so a change
 * (In elaborazione → Da approvare) is announced.
 *
 * Story 4.11a: with `href` (the intro's configurator), **Apri** follows the badge while the
 * intro is Da approvare or Approvato; it sits outside the status region, so only the status
 * is announced.
 */
export function IntroStatus({ status, href }: { status: CaseStatus; href?: string }) {
  const router = useRouter();
  const refresh = useRef(router.refresh);
  useEffect(() => {
    refresh.current = router.refresh;
  });
  const generating = status === "generating";
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => refresh.current(), GENERATING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [generating]);

  const opens = href !== undefined && (status === "in_review" || status === "approved");

  return (
    <div className="flex items-center gap-3">
      <p role="status" aria-live="polite" data-intro-status={status} className="flex items-center gap-2 font-label text-sm text-foreground-muted">
        <span>{it.clients.detail.intro}</span>
        <StatusBadge status={status} />
      </p>
      {opens && (
        <Link href={href} aria-label={fill(it.clients.detail.openIntroLabel, { status: it.status[status] })} className={cn(SECONDARY_ACTION, "h-7 px-3 text-[12.5px]")}>
          {it.clients.detail.openIntro}
        </Link>
      )}
    </div>
  );
}
