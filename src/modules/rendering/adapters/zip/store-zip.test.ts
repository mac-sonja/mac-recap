import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { storeZip } from "@/modules/rendering/adapters/zip/store-zip";

const entries = [
  { name: "01.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) },
  { name: "02.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4, 5]) },
];

/** Reads every stored entry back through the local headers. */
function readZip(zip: Uint8Array): { name: string; bytes: Buffer; crc: number }[] {
  const buf = Buffer.from(zip);
  const out: { name: string; bytes: Buffer; crc: number }[] = [];
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    expect(buf.readUInt16LE(at + 8)).toBe(0); // stored
    const crc = buf.readUInt32LE(at + 14);
    const size = buf.readUInt32LE(at + 18);
    const nameLength = buf.readUInt16LE(at + 26);
    const extra = buf.readUInt16LE(at + 28);
    const name = buf.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extra;
    out.push({ name, bytes: buf.subarray(start, start + size), crc });
    at = start + size;
  }
  expect(buf.readUInt32LE(at)).toBe(0x02014b50); // the central directory follows
  return out;
}

describe("storeZip (Story 5.3)", () => {
  it("stores each entry in order with its CRC, and ends with the directory", () => {
    const zip = storeZip(entries);
    const read = readZip(zip);
    expect(read.map((e) => e.name)).toEqual(["01.png", "02.png"]);
    read.forEach((entry, i) => {
      expect([...entry.bytes]).toEqual([...entries[i].bytes]);
      expect(entry.crc).toBe(crc32(entries[i].bytes));
    });
    const end = Buffer.from(zip).subarray(-22);
    expect(end.readUInt32LE(0)).toBe(0x06054b50);
    expect(end.readUInt16LE(10)).toBe(2);
  });

  it("is deterministic", () => {
    expect(Buffer.from(storeZip(entries)).equals(Buffer.from(storeZip(entries)))).toBe(true);
  });

  const hasUnzip = spawnSync("unzip", ["-v"]).status === 0;
  it.skipIf(!hasUnzip)("passes unzip's own test", () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    try {
      const file = join(dir, "carosello.zip");
      writeFileSync(file, storeZip(entries));
      const tested = spawnSync("unzip", ["-t", file]);
      expect(tested.status, tested.stdout.toString()).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
