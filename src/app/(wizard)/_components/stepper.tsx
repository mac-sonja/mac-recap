import { Check } from "lucide-react";
import Link from "next/link";
import { wizardHref } from "@/app/_lib/routes";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/** The wizard's steps, in order: 1 Materiale, 2 Dettagli, 3 Genera. Step 0 (name) has no segment. */
export const WIZARD_STEPS = [it.wizard.steps.material, it.wizard.steps.details, it.wizard.steps.generate] as const;

/** A wizard step number: 0 is the name form (no segment active), 1–3 the stepper segments. */
export type WizardStep = 0 | 1 | 2 | 3;

export interface StepperProps {
  current: WizardStep;
  /** The case the wizard is on; without it (step 0) no segment is a link. */
  caseId?: string;
  /** Whether the case has material: only then can Dettagli and Genera be opened. */
  reachable?: boolean;
  /** The segment labels, in order (default: the case wizard's `WIZARD_STEPS`). */
  steps?: readonly string[];
  /** A step's link (default: the case wizard's, from `caseId`); without one no segment is a link. */
  hrefFor?: (step: 1 | 2 | 3) => string;
}

/**
 * The segmented stepper (DESIGN.md segmented control): a grey track with a 3px
 * inset; the current step is `surface-selected` with `aria-current="step"`; steps
 * before it are done, marked ✓ in `foreground`; the rest are muted. At step 0 no
 * segment is active. Once a case exists, a step other than the current one is a
 * link to it when it is done, when it is Materiale, or when the case has material
 * (`reachable`); links read "vai a {step}" plus its state to screen readers.
 */
export function Stepper({ current, caseId, reachable = false, steps = WIZARD_STEPS, hrefFor }: StepperProps) {
  const linkTo = hrefFor ?? (caseId === undefined ? undefined : (step: 1 | 2 | 3) => wizardHref(caseId, step));
  return (
    <ol aria-label={it.wizard.stepper.label} className="flex gap-1 rounded-md bg-surface-control p-[3px]">
      {steps.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3;
        const isCurrent = step === current;
        const isDone = step < current;
        const isLink = linkTo !== undefined && !isCurrent && (isDone || step === 1 || reachable);
        const content = (
          <>
            {isDone ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <span aria-hidden="true" className="font-mono text-xs">
                {step}
              </span>
            )}
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
              "flex flex-1 rounded-sm font-label text-sm text-foreground-muted",
              isCurrent && "bg-surface-selected text-foreground",
              isDone && "text-foreground",
            )}
          >
            {isLink ? (
              <Link
                href={linkTo(step)}
                className="flex flex-1 items-center justify-center gap-2 rounded-sm py-2 hover:bg-surface-selected hover:text-foreground-strong"
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
          className={cn("h-1.5 w-1.5 rounded-full bg-surface-selected", index + 1 === current && "w-5 bg-foreground")}
        />
      ))}
    </div>
  );
}
