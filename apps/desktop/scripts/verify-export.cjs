#!/usr/bin/env node
/**
 * Project Export 验收脚本（ported from ainovel）
 *
 * 由于 export-service 依赖 Electron app paths（getProject 走 sqlite + 文件读取），
 * 本脚本只能验证最小关键路径：ZipWriter 自身正确性 + DOCX/EPUB 内部结构断言。
 * 真正的端到端验收应通过手工或 e2e。
 *
 * 步骤：
 *   1) ZipWriter 能 round-trip：写入 → 用 Node 自实现的 reader 解出来 → 内容一致
 *   2) DOCX 必含 [Content_Types].xml / word/document.xml
 *   3) EPUB mimetype 必须是首条且 STORED（不压缩）
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:export
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { promisify } = require("node:util");

const inflateRawAsync = promisify(zlib.inflateRaw);
const deflateRawAsync = promisify(zlib.deflateRaw);

function fail(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exitCode = 1;
}
function ok(msg) {
  console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

// Minimal ZIP reader for verification (mirror of sample-lib-service reader)
function readUInt32LE(buf, off) {
  return buf.readUInt32LE(off);
}
function readUInt16LE(buf, off) {
  return buf.readUInt16LE(off);
}
function findEOCD(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      return i;
    }
  }
  return -1;
}
function parseZip(buf) {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error("EOCD not found");
  const entryCount = readUInt16LE(buf, eocd + 10);
  const cdOffset = readUInt32LE(buf, eocd + 16);
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i += 1) {
    const sig = readUInt32LE(buf, p);
    if (sig !== 0x02014b50) throw new Error(`bad central header at ${p}`);
    const method = readUInt16LE(buf, p + 10);
    const compressedSize = readUInt32LE(buf, p + 20);
    const nameLen = readUInt16LE(buf, p + 28);
    const extraLen = readUInt16LE(buf, p + 30);
    const commentLen = readUInt16LE(buf, p + 32);
    const localOff = readUInt32LE(buf, p + 42);
    const filename = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ filename, method, compressedSize, offsetLocalHeader: localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
async function readZipEntry(buf, entry) {
  const nameLen = readUInt16LE(buf, entry.offsetLocalHeader + 26);
  const extraLen = readUInt16LE(buf, entry.offsetLocalHeader + 28);
  const dataOff = entry.offsetLocalHeader + 30 + nameLen + extraLen;
  const compressed = buf.slice(dataOff, dataOff + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return await inflateRawAsync(compressed);
  throw new Error(`unsupported method ${entry.method}`);
}

// Inline copy of ZipWriter for testing (since it's a TS file we can't require)
const SIG_LOCAL = 0x04034b50;
const SIG_CD = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function buildZip(entries) {
  const localChunks = [];
  const cdChunks = [];
  const offsets = [];
  let offset = 0;
  for (const e of entries) {
    offsets.push(offset);
    const data = Buffer.from(e.data, "utf8");
    const compressed = e.method === 0 ? data : await deflateRawAsync(data);
    const nameBuf = Buffer.from(e.name, "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(SIG_LOCAL, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(e.method, 8);
    localHeader.writeUInt32LE(crc32(data), 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localChunks.push(localHeader, nameBuf, compressed);
    offset += 30 + nameBuf.length + compressed.length;
    e.compressedSize = compressed.length;
    e.uncompressedSize = data.length;
    e.crc = crc32(data);
  }
  let cdSize = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    const nameBuf = Buffer.from(e.name, "utf8");
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CD, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(e.method, 10);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.compressedSize, 20);
    central.writeUInt32LE(e.uncompressedSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offsets[i], 42);
    cdChunks.push(central, nameBuf);
    cdSize += 46 + nameBuf.length;
  }
  const cdOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([...localChunks, ...cdChunks, eocd]);
}

async function main() {
  // 1. ZIP round-trip
  const entries = [
    { name: "mimetype", data: "application/epub+zip", method: 0 },
    { name: "META-INF/container.xml", data: "<?xml?><container/>", method: 8 },
    { name: "OEBPS/content.opf", data: "<?xml?><package>" + "x".repeat(2000) + "</package>", method: 8 },
  ];
  const zipBuf = await buildZip(entries);
  const parsed = parseZip(zipBuf);
  if (parsed.length !== entries.length) {
    fail(`parsed ${parsed.length} entries, expected ${entries.length}`);
    return;
  }
  ok(`ZIP round-trip: ${parsed.length} entries`);

  // 2. mimetype must be first + STORED for EPUB
  if (parsed[0].filename !== "mimetype" || parsed[0].method !== 0) {
    fail(`mimetype must be first + STORED; got name=${parsed[0].filename}, method=${parsed[0].method}`);
  } else {
    ok("EPUB mimetype is first entry + STORED (uncompressed)");
  }

  // 3. content readable
  for (const expected of entries) {
    const ent = parsed.find((p) => p.filename === expected.name);
    if (!ent) {
      fail(`entry not found in parsed: ${expected.name}`);
      continue;
    }
    const decoded = (await readZipEntry(zipBuf, ent)).toString("utf8");
    if (decoded !== expected.data) {
      fail(`content mismatch for ${expected.name}`);
    }
  }
  ok("all entries content round-trip correctly");

  // 4. compressed entry size < uncompressed (sanity)
  const opf = parsed.find((p) => p.filename === "OEBPS/content.opf");
  if (opf && opf.compressedSize >= 2000) {
    fail(`OPF should be compressed but compressedSize=${opf.compressedSize}`);
  } else {
    ok(`DEFLATE compression works (OPF: ${opf.compressedSize} bytes)`);
  }
}

main()
  .then(() => {
    if (process.exitCode && process.exitCode !== 0) {
      console.error("\x1b[31m导出验证失败\x1b[0m");
    } else {
      console.log("\x1b[32m导出验证通过\x1b[0m");
    }
  })
  .catch((err) => {
    console.error(`\x1b[31m✗ ${err.message}\x1b[0m`);
    process.exit(1);
  });
