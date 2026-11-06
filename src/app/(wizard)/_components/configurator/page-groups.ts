import type { Page } from "@/modules/generation";
import { it } from "@/shared/i18n/it";

/**
 * How the canvas and Pagine group the pages: by section for a case (Intro, Output,
 * Risultati; C36), by role for a client's intro and outro (Story 4.11a: Introduzione,
 * Chiusura).
 */
export type PageGroups = "section" | "role";

/** The group label a page sits under. */
export const groupLabelOf = (page: Pick<Page, "section" | "role">, groups: PageGroups): string =>
  groups === "role" ? it.configurator.clientSections[page.role] : it.configurator.sections[page.section];
