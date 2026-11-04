import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBytes } from "@/modules/rendering/adapters/http/fetch-bytes";

const MAX = 50 * 1024 * 1024;

function stubFetch(response: Response) {
  const fetch = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchBytes (Story 5.3)", () => {
  it("returns the body of a 2xx answer, with the signal and no redirects", async () => {
    const fetch = stubFetch(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const signal = new AbortController().signal;
    expect(await fetchBytes("https://storage.test/a.webp", signal)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetch).toHaveBeenCalledWith("https://storage.test/a.webp", { signal, redirect: "error" });
  });

  it("throws on a non-2xx answer", async () => {
    stubFetch(new Response("no", { status: 403 }));
    await expect(fetchBytes("https://storage.test/a.webp", new AbortController().signal)).rejects.toThrow("403");
  });

  it("throws on a content-length over the limit without reading the body", async () => {
    const response = new Response("small", { status: 200, headers: { "content-length": String(MAX + 1) } });
    const read = vi.spyOn(response, "arrayBuffer");
    stubFetch(response);
    await expect(fetchBytes("https://storage.test/a.webp", new AbortController().signal)).rejects.toThrow("too large");
    expect(read).not.toHaveBeenCalled();
  });

  it("throws on an oversized body sent without a content-length", async () => {
    const response = new Response(null, { status: 200 });
    vi.spyOn(response, "arrayBuffer").mockResolvedValue(new ArrayBuffer(MAX + 1));
    stubFetch(response);
    await expect(fetchBytes("https://storage.test/a.webp", new AbortController().signal)).rejects.toThrow("too large");
  });
});
