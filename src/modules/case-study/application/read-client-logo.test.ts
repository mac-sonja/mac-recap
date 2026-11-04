import { describe, expect, it, vi } from "vitest";
import { makeReadClientLogo } from "@/modules/case-study/application/read-client-logo";
import { err, ok, type Result } from "@/shared/result";

const CLIENT = "dddddddd-0000-4000-8000-000000000001";
const LOGO = "ffffffff-0000-4000-8000-000000000001";
const BYTES = new Uint8Array([1, 2, 3]);

function deps(logoId: string | null = LOGO) {
  const clients = {
    findById: vi.fn(async () => ok({ id: CLIENT, logoId } as never)),
    findLogo: vi.fn(async () => ok({ id: LOGO, clientId: CLIENT, contentType: "image/svg+xml" as const, sizeBytes: 3 })),
  };
  const storage = { read: vi.fn(async (): Promise<Result<Uint8Array | null>> => ok(BYTES)) };
  return { clients, storage, read: makeReadClientLogo(clients, storage) };
}

describe("readClientLogo (Story 5.3)", () => {
  it("reads the current logo's bytes and type from its own key", async () => {
    const d = deps();
    expect(await d.read(CLIENT)).toEqual(ok({ bytes: BYTES, contentType: "image/svg+xml" }));
    expect(d.storage.read).toHaveBeenCalledWith({ clientId: CLIENT, logoId: LOGO, contentType: "image/svg+xml" });
  });

  it("is null without a logo, a logo row or its object", async () => {
    expect(await deps(null).read(CLIENT)).toEqual(ok(null));
    const noRow = deps();
    noRow.clients.findLogo.mockResolvedValue(ok(null) as never);
    expect(await noRow.read(CLIENT)).toEqual(ok(null));
    const noObject = deps();
    noObject.storage.read.mockResolvedValue(ok(null));
    expect(await noObject.read(CLIENT)).toEqual(ok(null));
  });

  it("is CLIENT_NOT_FOUND for a malformed or unknown client, and passes storage errors on", async () => {
    expect(await deps().read("nope")).toMatchObject({ ok: false, error: { code: "CLIENT_NOT_FOUND" } });
    const unknown = deps();
    unknown.clients.findById.mockResolvedValue(ok(null) as never);
    expect(await unknown.read(CLIENT)).toMatchObject({ ok: false, error: { code: "CLIENT_NOT_FOUND" } });
    const down = deps();
    down.storage.read.mockResolvedValue(err({ code: "STORAGE_FAILED", message: "x" }));
    expect(await down.read(CLIENT)).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
  });
});
