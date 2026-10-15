import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/app/_components/status-badge";
import type { CaseStatus } from "@/modules/access";
import { it } from "@/shared/i18n/it";
import { StepDots, Stepper, type WizardStep } from "./stepper";

/** The case the wizard is on; absent at step 0 until the case is created. */
export interface WizardCase {
  id: string;
  name: string;
  status: CaseStatus;
}

export interface WizardFrameProps {
  /** `null` before the case exists: the title then reads *Nuovo case study*. */
  caseStudy: WizardCase | null;
  current: WizardStep;
  /** Whether the case has material: Dettagli and Genera are stepper links only then. */
  reachable?: boolean;
  /** The step's content. Hidden below 1024px, where the larger-screen message shows instead. */
  children: ReactNode;
}

/**
 * The focused wizard frame (EXPERIENCE.md, Wizard layout): no sidebar; a slim top
 * bar with the back arrow, the case name and ID (mono) and the status badge; one
 * column about 820px wide, centred both ways under the top bar, which starts at
 * the top and scrolls when it is taller than the viewport while the top bar stays.
 * In the column: eyebrow, large title, stepper (its reachable steps are links),
 * then the step content. Below 1024px the stepper and the content give way to
 * the larger-screen message.
 */
export function WizardFrame({ caseStudy, current, reachable = false, children }: WizardFrameProps) {
  return (
    <div className="flex h-dvh flex-col bg-surface text-foreground">
      <header className="flex h-15 shrink-0 items-center gap-4 border-b px-8">
        <Link
          href="/case-studies"
          aria-label={it.wizard.back}
          className="-m-1 rounded-sm p-1 text-foreground hover:text-foreground-strong"
        >
          <ArrowLeft aria-hidden="true" className="size-[18px]" />
        </Link>
        {caseStudy !== null && (
          <>
            <span className="min-w-0 truncate font-body text-sm text-foreground">{caseStudy.name}</span>
            <span className="shrink-0 font-mono text-xs text-foreground-muted">
              <span className="sr-only">{`${it.wizard.caseId} `}</span>
              {caseStudy.id}
            </span>
            <StatusBadge status={caseStudy.status} className="ml-auto shrink-0" />
          </>
        )}
      </header>
      <main className="flex flex-1 overflow-auto px-6 py-10">
        <div className="m-auto w-full max-w-[820px]">
          <p className="mb-2 font-label text-xs text-foreground-muted">{it.wizard.eyebrow}</p>
          <h1 className="mb-8 break-words font-display text-[2.5rem] leading-tight font-medium tracking-tight text-foreground-strong">
            {caseStudy?.name ?? it.wizard.eyebrow}
          </h1>
          <p className="max-w-prose font-body text-base text-foreground lg:hidden">{it.caseStudies.narrowScreen}</p>
          <div className="hidden lg:block">
            <div className="mb-10">
              <Stepper current={current} caseId={caseStudy?.id} reachable={reachable} />
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * The wizard footer under a divider: an optional left slot, the step dots in the
 * centre, and the step's action (**Avanti**) on the right.
 */
export function WizardFooter({ current, start, action }: { current: WizardStep; start?: ReactNode; action: ReactNode }) {
  return (
    <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center border-t pt-5">
      <div className="font-label text-xs text-foreground-muted">{start}</div>
      <StepDots current={current} />
      <div className="justify-self-end">{action}</div>
    </div>
  );
}
