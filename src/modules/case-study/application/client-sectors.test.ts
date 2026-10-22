import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { ClientSector } from "@/modules/case-study/domain/case-study";
import type { ClientSectorRepository } from "@/modules/case-study/ports/client-sector-repository";
import { sectorLabelKey } from "@/shared/sector-label";
import { err, ok } from "@/shared/result";
import { makeAddClientSector, makeListClientSectors } from "./client-sectors";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};

const SEEDED: ClientSector[] = [
  { key: "interior_design", label: "Interior design" },
  { key: "energia", label: "Energia" },
  { key: "risorse_umane", label: "Risorse umane" },
  { key: "lusso", label: "Lusso" },
];

/** In-memory ClientSectorRepository: mirrors `add_client_sector` (same name → the existing one). */
function fakeSectors(rows: ClientSector[] = SEEDED) {
  const sectors = [...rows];
  const repo = {
    list: vi.fn<ClientSectorRepository["list"]>(async () => ok([...sectors])),
    add: vi.fn<ClientSectorRepository["add"]>(async (label) => {
      const existing = sectors.find((sector) => sectorLabelKey(sector.label) === sectorLabelKey(label));
      if (existing) return ok(existing);
      const sector = { key: sectorLabelKey(label).replace(/[^a-z0-9]+/g, "_"), label };
      sectors.push(sector);
      return ok(sector);
    }),
  } satisfies ClientSectorRepository;
  return { repo, sectors };
}

describe("listClientSectors", () => {
  it("returns the shared list in display order", async () => {
    const { repo } = fakeSectors([...SEEDED, { key: "nautica", label: "Nautica" }]);
    expect(await makeListClientSectors(repo)()).toEqual(ok([...SEEDED, { key: "nautica", label: "Nautica" }]));
  });
});

describe("addClientSector", () => {
  it("adds the trimmed, collapsed label with the actor; the next list has it", async () => {
    const { repo } = fakeSectors();
    expect(await makeAddClientSector(repo)(actor, { label: "  Nautica   da diporto " })).toEqual(
      ok({ key: "nautica_da_diporto", label: "Nautica da diporto" }),
    );
    expect(repo.add).toHaveBeenCalledExactlyOnceWith("Nautica da diporto", actor.id);
    const listed = await makeListClientSectors(repo)();
    expect(listed.ok && listed.value.at(-1)).toEqual({ key: "nautica_da_diporto", label: "Nautica da diporto" });
  });

  it("returns the existing sector for the same name, adding nothing", async () => {
    const { repo, sectors } = fakeSectors();
    expect(await makeAddClientSector(repo)(actor, { label: " energia " })).toEqual(ok({ key: "energia", label: "Energia" }));
    expect(sectors).toHaveLength(4);
  });

  it.each([
    ["one character", { label: "N" }],
    ["41 characters", { label: "x".repeat(41) }],
    ["only spaces", { label: "    " }],
    ["no label", {}],
  ])("refuses %s as SECTOR_LABEL_INVALID without writing", async (_label, input) => {
    const { repo } = fakeSectors();
    expect(await makeAddClientSector(repo)(actor, input)).toMatchObject({
      ok: false,
      error: { code: "SECTOR_LABEL_INVALID", details: { fields: ["label"] } },
    });
    expect(repo.add).not.toHaveBeenCalled();
  });

  it("refuses a non-object input as INVALID_INPUT", async () => {
    const { repo } = fakeSectors();
    expect(await makeAddClientSector(repo)(actor, "Nautica")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(repo.add).not.toHaveBeenCalled();
  });

  it("passes a write failure on", async () => {
    const { repo } = fakeSectors();
    repo.add.mockResolvedValueOnce(err({ code: "CLIENT_WRITE_FAILED", message: "Could not add the sector." }));
    expect(await makeAddClientSector(repo)(actor, { label: "Nautica" })).toMatchObject({ ok: false, error: { code: "CLIENT_WRITE_FAILED" } });
  });
});
