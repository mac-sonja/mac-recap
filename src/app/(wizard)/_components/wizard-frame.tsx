import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/app/_components/status-badge";
import type { CaseStatus } from "@/modules/access";
import { it } from "@/shared/i18n/it";
import { Stepper, type Reachable, type WizardStep } from "./stepper";
import { WizardTitleProvider, WizardTitleText } from "./wizard-title";

/** The case the wizard is on; absent on step 1 until the case is created. */
export interface WizardCase {
  /** The uuid: links and keys only, never shown. */
  id: string;
  /** The readable case history code (e.g. `LUM-2026-01`), shown in the top bar. */
  code: string;
  name: string;
  status: CaseStatus;
  /** Shown after the eyebrow ("NUOVA CASE HISTORY · ORTICA BIKE"). */
  clientName?: string;
}

export interface WizardFrameProps {
  /** `null` before the case exists (or in another wizard): the title then reads the eyebrow. */
  caseStudy: WizardCase | null;
  current: WizardStep;
  /** Which later steps are stepper links (see `Reachable`). */
  reachable?: Reachable;
  /** The step's content. Hidden below 1024px, where the larger-screen message shows instead. */
  children: ReactNode;
  /** The top bar's back arrow (default: Case history). */
  back?: { href: string; label: string };
  /** The line above the title, and the title when there is no name (default: *Nuova case history*). */
  eyebrow?: string;
  /** The title (default: the case name, else the eyebrow). */
  title?: string;
  /** The top bar after the back arrow (default: the case name, code and status badge). */
  header?: ReactNode;
  /** The stepper's labels (default: the case wizard's). */
  steps?: readonly string[];
  /** The stepper's links (default: the case wizard's, from the case id). */
  hrefFor?: (step: 1 | 2 | 3) => string;
}

/**
 * The focused wizard frame (EXPERIENCE.md, Wizard layout): no sidebar; a slim top
 * bar with the back arrow, the case name, its code (mono) and the status badge; one
 * column about 680px wide, centred under the top bar and starting near the top (owner,
 * 2026-10-21), scrolling when it is taller than the viewport while the top bar stays.
 * In the column: eyebrow (uppercase, with the client), large title, stepper (its reachable steps are links),
 * then the step content. Below 1024px the stepper and the content give way to
 * the larger-screen message. A step may replace the title while it is shown
 * (`useLiveWizardTitle`, the case wizard's Dettagli step, Story 2.18).
 */
export function WizardFrame({
  caseStudy,
  current,
  reachable = false,
  children,
  back = { href: "/case-studies", label: it.wizard.back },
  eyebrow = it.wizard.eyebrow,
  title,
  header,
  steps,
  hrefFor,
}: WizardFrameProps) {
  return (
    <WizardTitleProvider>
      <div className="flex h-dvh flex-col bg-surface text-foreground">
        <header className="flex h-15 shrink-0 items-center gap-3 border-b border-border bg-surface-sidebar px-6">
          <Link
            href={back.href}
            aria-label={back.label}
            className="grid size-8 place-items-center rounded-full text-foreground transition-[background-color,transform] duration-150 hover:bg-surface-hover active:scale-[0.94]"
          >
            <ArrowLeft aria-hidden="true" className="size-[18px]" />
          </Link>
          {header}
          {header === undefined && caseStudy !== null && (
            <>
              <span className="min-w-0 truncate font-label text-sm font-semibold text-foreground-strong">
                <WizardTitleText title={caseStudy.name} fallback={eyebrow} />
              </span>
              <span className="shrink-0 font-mono text-xs text-foreground-muted">
                <span className="sr-only">{`${it.wizard.caseId} `}</span>
                {caseStudy.code}
              </span>
              <StatusBadge status={caseStudy.status} className="shrink-0" />
            </>
          )}
        </header>
        {/*
          No bottom padding from 1024 px, so the sticky footer sits flush on the viewport's
          bottom edge (owner, 2026-10-20); the footer pads itself. The scroll padding keeps a
          focused field clear of it. `relative` keeps the steps' absolutely placed screen-reader
          regions (`sr-only`) inside this scroll area; otherwise they stretch the document below the
          frame and the page itself scrolls past the footer into an empty band.
        */}
        <main className="relative flex flex-1 overflow-auto scroll-pb-28 px-6 pt-12 pb-10 lg:pb-0">
          <div className="mx-auto w-full max-w-[680px]">
            <p className="mb-2.5 font-label text-[11px] font-semibold tracking-[0.12em] text-foreground-muted uppercase">
              {caseStudy?.clientName ? `${eyebrow} · ${caseStudy.clientName}` : eyebrow}
            </p>
            <h1 className="mb-7 break-words font-display text-[2.25rem] leading-[1.1] font-semibold tracking-[-0.03em] text-foreground-strong">
              <WizardTitleText title={title ?? caseStudy?.name ?? eyebrow} fallback={eyebrow} />
            </h1>
            <p className="max-w-prose font-body text-base text-foreground lg:hidden">{it.caseStudies.narrowScreen}</p>
            <div className="hidden lg:block">
              <div className="mb-10">
                <Stepper current={current} caseId={caseStudy?.id} reachable={reachable} steps={steps} hrefFor={hrefFor} />
              </div>
              {children}
            </div>
          </div>
        </main>
      </div>
    </WizardTitleProvider>
  );
}

/**
 * The footer's layout: sticky at the bottom of the scrolling column, opaque, under a
 * divider. The main area has no bottom padding at this width, so the sticky edge is
 * the viewport's bottom edge: nothing shows below the footer, and no filler is needed.
 * A solid page colour, not frosted glass: cards scrolling under a translucent footer
 * showed through as a blurred grey box (owner, 2026-10-21). The background reaches
 * 24 px past the column on each side (`before:`), so the cards' edges and shadows don't
 * peek out beside it; the divider and the content stay as wide as the column.
 */
export const WIZARD_FOOTER =
  "sticky bottom-0 z-10 mt-8 flex items-center justify-between gap-6 border-t border-border bg-surface pt-4 pb-6 before:absolute before:inset-y-0 before:-inset-x-6 before:-z-10 before:bg-surface";

/**
 * The wizard footer under a divider: an optional note on the left and the step's
 * action (**Avanti**) on the right (no step dots, owner 2026-10-21). It sticks to the bottom of
 * the scrolling wizard column (Story 2.18) with a solid background, so it stays in
 * view on a long step; as it keeps its place in the flow, the content above it is
 * never hidden once scrolled to the end, and focus order is unchanged. Below 1024 px
 * the step content (footer included) is hidden by the frame.
 */
export function WizardFooter({ start, action }: { start?: ReactNode; action: ReactNode }) {
  return (
    <div data-wizard-footer="" className={WIZARD_FOOTER}>
      <div className="font-label text-xs text-foreground-muted">{start}</div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
