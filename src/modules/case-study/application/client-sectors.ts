import type { Actor } from "@/modules/access";
import { addClientSectorInputSchema, type ClientSector } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import { err, type Result } from "@/shared/result";
import type { ClientSectorRepository } from "@/modules/case-study/ports/client-sector-repository";

/**
 * Every client sector in display order: the four seeded ones, then the added ones
 * as they were added. The caller has already authorized `list clients`.
 */
export function makeListClientSectors(sectors: ClientSectorRepository) {
  return function listClientSectors(): Promise<Result<ClientSector[]>> {
    return sectors.list();
  };
}

/**
 * Adds a sector to the shared list: input `{ label }`, whitespace collapsed and
 * trimmed, 2–40 characters. When a sector with the same name exists (case, accents
 * and spaces aside) it is returned instead and nothing is written. It doesn't need a
 * client. The caller has already authorized `manage clients`. `SECTOR_LABEL_INVALID`
 * (naming `label`) for a name outside 2–40 characters or with a character Postgres
 * can't hold, `INVALID_INPUT` for anything else malformed; nothing is written then.
 */
export function makeAddClientSector(sectors: ClientSectorRepository) {
  return async function addClientSector(actor: Actor, input: unknown): Promise<Result<ClientSector>> {
    const parsed = parseInput(addClientSectorInputSchema, input);
    if (!parsed.ok) {
      const fields = (parsed.error.details as { fields: string[] }).fields;
      if (fields.length === 1 && fields[0] === "label") {
        return err({ code: "SECTOR_LABEL_INVALID", message: "A sector name is 2 to 40 characters.", details: { fields } });
      }
      return parsed;
    }
    return sectors.add(parsed.value.label, actor.id);
  };
}
