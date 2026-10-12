import { requireSurface } from "@/app/_lib/surface";
import { it } from "@/shared/i18n/it";

// Placeholder: the new-case-study wizard is the Story 2.5 UI part.
export default async function NewCaseStudyPage() {
  const shell = await requireSurface("create case");
  if (shell === null) return null;

  return <h1 className="font-heading text-2xl font-semibold text-foreground">{it.shell.nav.newCaseStudy}</h1>;
}
