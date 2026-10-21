import { Check } from "lucide-react";
import Link from "next/link";
import { wizardHref } from "@/app/_lib/routes";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/** The wizard's steps, in order: Dettagli, Materiale, Genera (Story 2.17). */
export const WIZARD_STEPS = [it.wizard.steps.details, it.wizard.steps.material, it.wizard.steps.generate] as const;

/** A wizard step number: the stepper segments 1–3. */
export type WizardStep = 1 | 2 | 3;

/**
 * Which steps after the first may be opened: one answer for every step (the client
 * wizard: once every required field is filled), or one per step (the case wizard:
 * Materiale once the details are complete, Genera once there is material too).
 */
export type Reachable = boolean | ((step: 1 | 2 | 3) => boolean);

export interface StepperProps {
  current: WizardStep;
  /** The case the wizard is on; without it (a new case) no segment is a link. */
  caseId?: string;
  /** Which later steps can be opened (see `Reachable`); step 1 always can. */
  reachable?: Reachable;
  /** The segment labels, in order (default: the case wizard's `WIZARD_STEPS`). */
  steps?: readonly string[];
  /** A step's link (default: the case wizard's, from `caseId`); without one no segment is a link. */
  hrefFor?: (step: 1 | 2 | 3) => string;
}

/**
 * The segmented stepper (DESIGN.md segmented control): a grey track with a 3px
 * inset; the current step is `surface-selected` with `aria-current="step"`; steps
 * before it are done, marked ✓ in `foreground`; the rest are muted. Labels only, no
 * step numbers (owner, 2026-10-21). Once a case
 * exists, a step other than the current one is a link to it when it is done, when
 * it is step 1, or when `reachable` allows it; links read "vai a {step}" plus its
 * state to screen readers.
 */
export function Stepper({ current, caseId, reachable = false, steps = WIZARD_STEPS, hrefFor }: StepperProps) {
  const linkTo = hrefFor ?? (caseId === undefined ? undefined : (step: 1 | 2 | 3) => wizardHref(caseId, step));
  return (
    <ol aria-label={it.wizard.stepper.label} className="flex gap-1 rounded-full bg-surface-control p-[3px]">
      {steps.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3;
        const isCurrent = step === current;
        const isDone = step < current;
        const canReach = typeof reachable === "function" ? reachable(step) : reachable;
        const isLink = linkTo !== undefined && !isCurrent && (isDone || step === 1 || canReach);
        const content = (
          <>
            {isDone && <Check aria-hidden="true" className="size-3.5" />}
            {isLink && <span className="sr-only">{`${it.wizard.stepper.goTo} `}</span>}
            {label}
            {isDone && <span className="sr-only">{`, ${it.wizard.stepper.done}`}</span>}
          </>
        );
        return (
          <li
            key={label}
            data-step={step}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "flex flex-1 rounded-full font-label text-sm text-foreground-muted",
              isCurrent && "bg-surface-raised font-medium text-foreground-strong shadow-control",
              isDone && "text-foreground",
            )}
          >
            {isLink ? (
              <Link
                href={linkTo(step)}
                className="flex flex-1 items-center justify-center gap-2 rounded-full py-2 transition-colors duration-150 hover:bg-surface-hover hover:text-foreground-strong"
              >
                {content}
              </Link>
            ) : (
              <span className="flex flex-1 items-center justify-center gap-2 py-2">{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The footer's step dots: decorative, they mirror the stepper (the current one is wide). */
export function StepDots({ current, steps = WIZARD_STEPS }: { current: WizardStep; steps?: readonly string[] }) {
  return (
    <div aria-hidden="true" className="flex justify-center gap-1.5">
      {steps.map((label, index) => (
        <span
          key={label}
          data-dot={index + 1}
          data-active={index + 1 === current ? "" : undefined}
          className={cn("h-1.5 w-1.5 rounded-full bg-border-strong", index + 1 === current && "w-5 bg-foreground")}
        />
      ))}
    </div>
  );
}
