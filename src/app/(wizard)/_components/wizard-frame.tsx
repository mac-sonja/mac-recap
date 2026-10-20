import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/app/_components/status-badge";
import type { CaseStatus } from "@/modules/access";
import { it } from "@/shared/i18n/it";
import { StepDots, Stepper, type Reachable, type WizardStep } from "./stepper";
import { WizardTitleProvider, WizardTitleText } from "./wizard-title";

/** The case the wizard is on; absent on step 1 until the case is created. */
export interface WizardCase {
  /** The uuid: links and keys only, never shown. */
  id: string;
  /** The readable case history code (e.g. `LUM-2026-01`), shown in the top bar. */
  code: string;
  name: string;
  status: CaseStatus;
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
 * bar with the back arrow, the case name and its code (mono) and the status badge; one
 * column about 820px wide, centred both ways under the top bar, which starts at
 * the top and scrolls when it is taller than the viewport while the top bar stays.
 * In the column: eyebrow, large title, stepper (its reachable steps are links),
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
        <header className="flex h-15 shrink-0 items-center gap-4 border-b px-8">
          <Link href={back.href} aria-label={back.label} className="-m-1 rounded-sm p-1 text-foreground hover:text-foreground-strong">
            <ArrowLeft aria-hidden="true" className="size-[18px]" />
          </Link>
          {header}
          {header === undefined && caseStudy !== null && (
            <>
              <span className="min-w-0 truncate font-body text-sm text-foreground">
                <WizardTitleText title={caseStudy.name} fallback={eyebrow} />
              </span>
              <span className="shrink-0 font-mono text-xs text-foreground-muted">
                <span className="sr-only">{`${it.wizard.caseId} `}</span>
                {caseStudy.code}
              </span>
              <StatusBadge status={caseStudy.status} className="ml-auto shrink-0" />
            </>
          )}
        </header>
        {/* The scroll padding keeps a focused field clear of the sticky footer. */}
        <main className="flex flex-1 overflow-auto scroll-pb-36 px-6 py-10">
          <div className="m-auto w-full max-w-[820px]">
            <p className="mb-2 font-label text-xs text-foreground-muted">{eyebrow}</p>
            <h1 className="mb-8 break-words font-display text-[2.5rem] leading-tight font-medium tracking-tight text-foreground-strong">
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
 * divider. The sticky edge is the main area's 40 px bottom padding, so a solid shadow
 * of that height keeps content from showing through below the footer.
 */
export const WIZARD_FOOTER =
  "sticky bottom-0 z-10 mt-8 grid grid-cols-[1fr_auto_1fr] items-center border-t bg-surface pt-5 pb-6 shadow-[0_2.5rem_0_var(--color-surface)]";

/**
 * The wizard footer under a divider: an optional left slot, the step dots in the
 * centre, and the step's action (**Avanti**) on the right. It sticks to the bottom of
 * the scrolling wizard column (Story 2.18) with a solid background, so it stays in
 * view on a long step; as it keeps its place in the flow, the content above it is
 * never hidden once scrolled to the end, and focus order is unchanged. Below 1024 px
 * the step content (footer included) is hidden by the frame.
 */
export function WizardFooter({
  current,
  start,
  action,
  steps,
}: {
  current: WizardStep;
  start?: ReactNode;
  action: ReactNode;
  /** The stepper's labels, for the dots (default: the case wizard's). */
  steps?: readonly string[];
}) {
  return (
    <div data-wizard-footer="" className={WIZARD_FOOTER}>
      <div className="font-label text-xs text-foreground-muted">{start}</div>
      <StepDots current={current} steps={steps} />
      <div className="justify-self-end">{action}</div>
    </div>
  );
}
