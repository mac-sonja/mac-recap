import { requireSurface } from "@/app/_lib/surface";
import { it } from "@/shared/i18n/it";

// Placeholder: the Case studies table is Story 2.6.
export default async function CaseStudiesPage() {
  const shell = await requireSurface("list cases");
  if (shell === null) return null;

  return <h1 className="font-heading text-2xl font-semibold text-foreground">{it.caseStudies.heading}</h1>;
}
