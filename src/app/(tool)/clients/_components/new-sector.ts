import type { ClientSector } from "@/modules/case-study";
import { charCount } from "@/app/_components/results-fields";
import { fill, it } from "@/shared/i18n/it";
import { normalizeSectorLabel, sectorLabelKey } from "@/shared/sector-label";
import type { ClientLimits } from "../_lib/client-limits";

type SectorLimits = Pick<ClientLimits, "sectorLabelMin" | "sectorLabelMax">;

/**
 * What to do with a sector name typed in an "Aggiungi settore" field (the client panel and
 * the configurator's Settore): nothing (`empty`), refuse it (`length`), select a sector
 * already listed under the same name (case, accents and spaces aside: `known`), or add
 * `label` to the shared list (`add`, then `addClientSector`).
 */
export type NewSectorCheck = { kind: "empty" } | { kind: "length" } | { kind: "known"; sector: ClientSector } | { kind: "add"; label: string };

export function checkNewSector(typed: string, options: readonly ClientSector[], limits: SectorLimits): NewSectorCheck {
  const label = normalizeSectorLabel(typed);
  if (label === "") return { kind: "empty" };
  const length = charCount(label);
  if (length < limits.sectorLabelMin || length > limits.sectorLabelMax) return { kind: "length" };
  const known = options.find((sector) => sectorLabelKey(sector.label) === sectorLabelKey(label));
  return known === undefined ? { kind: "add", label } : { kind: "known", sector: known };
}

/** The words under the field for a refused name (`length`, or `addClientSector`'s `code`). */
export function newSectorError(code: "length" | string, limits: SectorLimits): string {
  const copy = it.clientPanel.details.sector;
  return code === "length" || code === "SECTOR_LABEL_INVALID"
    ? fill(copy.length, { min: limits.sectorLabelMin, max: limits.sectorLabelMax })
    : copy.addFailed;
}
