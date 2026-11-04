import { crc32 } from "node:zlib";

/** One file of a ZIP: its name (`01.png`, or in a folder: `Carosello/01.png`) and its bytes. */
export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/** 1980-01-01 00:00 in DOS time: entries carry no real date, so the same content zips to the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

/**
 * A ZIP archive (Story 5.3's Carosello) with every entry stored, not deflated: PNGs are
 * already compressed. Plain ZIP (no ZIP64): at most 65535 entries and 4 GB, far above an
 * export. Deterministic: same entries, same bytes.
 */
export function storeZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > 0xffff) throw new Error("too many zip entries");
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
    if (offset > 0xffffffff) throw new Error("zip too large");
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

/**
 * The entries of a ZIP that `storeZip` wrote (Story 5.4: a bundle unpacks the stored
 * Carosello), in order. Only stored (not deflated) entries; each one's CRC is checked.
 * Throws on anything else: a stored export is ours, so a mismatch is a bug or damage.
 */
export function readStoredZip(bytes: Uint8Array): ZipEntry[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > end || buf.readUInt32LE(at) !== 0x02014b50) throw new Error("bad zip directory");
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    if (method !== 0 || buf.readUInt32LE(at + 24) !== size) throw new Error("zip entry not stored");
    if (offset + 30 > buf.length || buf.readUInt32LE(offset) !== 0x04034b50) throw new Error("bad zip entry");
    const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    if (start + size > buf.length) throw new Error("zip entry out of bounds");
    const data = buf.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error("zip entry damaged");
    entries.push({ name, bytes: new Uint8Array(data) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
