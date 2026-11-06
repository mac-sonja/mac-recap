"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { StatusBadge } from "@/app/_components/status-badge";
import type { CaseStatus } from "@/modules/access";
import { GENERATING_REFRESH_MS } from "@/shared/case-status";
import { it } from "@/shared/i18n/it";

/**
 * The client's intro status on its page (Story 3.11): "Introduzione:" and the status badge
 * (the case badge's hues). While the intro is In elaborazione the page asks the server
 * again every few seconds, and stops once it is not.
 */
export function IntroStatus({ status }: { status: CaseStatus }) {
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

  return (
    <p data-intro-status={status} className="flex items-center gap-2 font-label text-sm text-foreground-muted">
      <span>{it.clients.detail.intro}</span>
      <StatusBadge status={status} />
    </p>
  );
}
