import { deflateRaw } from "node:zlib";
import { promisify } from "node:util";

const deflateRawAsync = promisify(deflateRaw);

const SIG_LOCAL = 0x04034b50;
const SIG_CD = 0x02014b50;
const SIG_EOCD = 0x06054b50;

export type ZipMethod = 0 /* STORED */ | 8 /* DEFLATE */;

interface PendingEntry {
  filename: string;
  method: ZipMethod;
  data: Buffer;
  compressed: Buffer;
  crc32: number;
  uncompressedSize: number;
  compressedSize: number;
  modTime: number;
  modDate: number;
}

const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date): { time: number; date: number } {
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { time, date };
}

/**
 * Minimal in-memory ZIP writer.
 *
 * Use case: assemble small archives (DOCX / EPUB, typically < 50 MB).
 * Methods supported: STORED (0) and DEFLATE (8). Encoding fixed UTF-8.
 */
export class ZipWriter {
  private entries: PendingEntry[] = [];

  /**
   * Add a file entry. Caller chooses method:
   * - STORED for "magic" entries (e.g. EPUB mimetype must be first + STORED).
   * - DEFLATE for everything else (smaller).
   */
  async addFile(
    filename: string,
    data: string | Buffer,
    method: ZipMethod = 8,
  ): Promise<void> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const compressed =
      method === 0 ? buf : (await deflateRawAsync(buf)) as Buffer;
    const { time, date } = dosTime(new Date());
    this.entries.push({
      filename,
      method,
      data: buf,
      compressed,
      crc32: crc32(buf),
      uncompressedSize: buf.length,
      compressedSize: compressed.length,
      modTime: time,
      modDate: date,
    });
  }

  finalize(): Buffer {
    const localChunks: Buffer[] = [];
    const cdChunks: Buffer[] = [];
    let offset = 0;
    const offsets: number[] = [];

    for (const e of this.entries) {
      offsets.push(offset);
      const nameBuf = Buffer.from(e.filename, "utf8");
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(SIG_LOCAL, 0);
      localHeader.writeUInt16LE(20, 4);          // version needed
      localHeader.writeUInt16LE(0x0800, 6);      // general flag: bit 11 = UTF-8 filename
      localHeader.writeUInt16LE(e.method, 8);
      localHeader.writeUInt16LE(e.modTime, 10);
      localHeader.writeUInt16LE(e.modDate, 12);
      localHeader.writeUInt32LE(e.crc32, 14);
      localHeader.writeUInt32LE(e.compressedSize, 18);
      localHeader.writeUInt32LE(e.uncompressedSize, 22);
      localHeader.writeUInt16LE(nameBuf.length, 26);
      localHeader.writeUInt16LE(0, 28);          // extra len
      localChunks.push(localHeader, nameBuf, e.compressed);
      offset += 30 + nameBuf.length + e.compressed.length;
    }

    let cdSize = 0;
    for (let i = 0; i < this.entries.length; i += 1) {
      const e = this.entries[i];
      const nameBuf = Buffer.from(e.filename, "utf8");
      const central = Buffer.alloc(46);
      central.writeUInt32LE(SIG_CD, 0);
      central.writeUInt16LE(20, 4);              // version made by
      central.writeUInt16LE(20, 6);              // version needed
      central.writeUInt16LE(0x0800, 8);          // general flag: bit 11 = UTF-8
      central.writeUInt16LE(e.method, 10);
      central.writeUInt16LE(e.modTime, 12);
      central.writeUInt16LE(e.modDate, 14);
      central.writeUInt32LE(e.crc32, 16);
      central.writeUInt32LE(e.compressedSize, 20);
      central.writeUInt32LE(e.uncompressedSize, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      central.writeUInt16LE(0, 30);              // extra len
      central.writeUInt16LE(0, 32);              // comment len
      central.writeUInt16LE(0, 34);              // disk number
      central.writeUInt16LE(0, 36);              // internal attrs
      central.writeUInt32LE(0, 38);              // external attrs
      central.writeUInt32LE(offsets[i], 42);
      cdChunks.push(central, nameBuf);
      cdSize += 46 + nameBuf.length;
    }

    const cdOffset = offset;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(SIG_EOCD, 0);
    eocd.writeUInt16LE(0, 4);                    // disk number
    eocd.writeUInt16LE(0, 6);                    // start disk
    eocd.writeUInt16LE(this.entries.length, 8);
    eocd.writeUInt16LE(this.entries.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    eocd.writeUInt16LE(0, 20);                   // comment len

    return Buffer.concat([...localChunks, ...cdChunks, eocd]);
  }
}
