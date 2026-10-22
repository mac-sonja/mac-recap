import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));

const { default: NewClientPage } = await import("./page");

const ID = "cccccccc-0000-4000-8000-000000000001";
const renderPage = (params: { clientId?: string | string[]; step?: string | string[] }) => NewClientPage({ searchParams: Promise.resolve(params) });

describe("NewClientPage (the old client wizard URL)", () => {
  it("sends an add to the Clienti list with the add panel open", async () => {
    await expect(renderPage({})).rejects.toThrow("REDIRECT /clients?nuovo=1");
  });

  it.each([undefined, "1", "2"])("sends an edit (step %s) to the client's page with the edit panel open", async (step) => {
    await expect(renderPage({ clientId: ID, ...(step === undefined ? {} : { step }) })).rejects.toThrow(`REDIRECT /clients/${ID}?modifica=1`);
  });

  it.each([[["a", "b"]], ["not-a-uuid"], [""]])("sends a malformed or repeated id (%j) to /clients", async (clientId) => {
    await expect(renderPage({ clientId })).rejects.toThrow(/^REDIRECT \/clients$/);
  });
});
