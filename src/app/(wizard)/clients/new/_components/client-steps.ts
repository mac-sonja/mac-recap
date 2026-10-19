import { clientWizardHref } from "@/app/_lib/routes";
import { it } from "@/shared/i18n/it";

/**
 * The client wizard's stepper: Dettagli, Materiale. Step 3 Introduzione stays
 * hidden until it is designed with the owner (Story 4.11).
 */
export const CLIENT_WIZARD_STEPS = [it.clientWizard.steps.details, it.clientWizard.steps.material] as const;

/** A stepper link of an existing client's wizard. */
export const clientStepHref = (clientId: string) => (step: 1 | 2 | 3) => clientWizardHref(clientId, step === 1 ? 1 : 2);
