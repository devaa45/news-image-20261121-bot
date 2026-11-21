// The World Today — 21 November 2026
// Entry program for make.fun news-image-20261121.
//
// The repository holds the finished front-page image as entry.png. This
// program validates that file and writes the validated bytes to the output
// directory ($MAKEFUN_OUTPUT_DIR, default /output) as entry.png.
// Node 22, standard library only, no network.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1024 * 1024; // 1 MiB competition cap
const EXPECTED_WIDTH = 1024;
const EXPECTED_HEIGHT = 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// CRC-32 (PNG polynomial 0xEDB88320), table-driven, stdlib only.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Walk every chunk after the signature: each chunk's stored CRC must match
// the CRC of its type+data, the walk must end exactly at the end of the
// file, and the last chunk must be an empty IEND.
function validateChunks(bytes: Buffer): void {
  let offset = 8;
  let sawIend = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      fail(`truncated chunk header at offset ${offset}`);
    }
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > bytes.length) {
      fail(`chunk ${type} at offset ${offset} runs past the end of the file`);
    }
    const storedCrc = bytes.readUInt32BE(dataEnd);
    const actualCrc = crc32(bytes.subarray(offset + 4, dataEnd));
    if (storedCrc !== actualCrc) {
      fail(
        `chunk ${type} at offset ${offset} has CRC ${storedCrc.toString(16)}, expected ${actualCrc.toString(16)}`,
      );
    }
    if (type === "IEND") {
      if (length !== 0) fail("IEND chunk is not empty");
      if (crcEnd !== bytes.length) {
        fail(`${bytes.length - crcEnd} trailing bytes after IEND`);
      }
      sawIend = true;
    }
    offset = crcEnd;
  }
  if (!sawIend) fail("no IEND chunk found");
}

function fail(message: string): never {
  console.error(`main.ts: validation failed: ${message}`);
  process.exit(1);
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourcePath = join(here, "entry.png");
  const bytes = readFileSync(sourcePath);

  if (bytes.length === 0) fail("entry.png is empty");
  if (bytes.length > MAX_BYTES) {
    fail(`entry.png is ${bytes.length} bytes, over the 1 MiB cap`);
  }
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail("entry.png does not start with the PNG signature");
  }

  // IHDR must be the first chunk: after the 8-byte signature comes
  // length(4) + type(4) + 13 data bytes. Width and height are the
  // first 8 bytes of IHDR data.
  const ihdrLength = bytes.readUInt32BE(8);
  const ihdrType = bytes.toString("ascii", 12, 16);
  if (ihdrType !== "IHDR" || ihdrLength !== 13) {
    fail(`first chunk is ${ihdrType}/${ihdrLength}, expected IHDR/13`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
    fail(`image is ${width}x${height}, expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`);
  }

  validateChunks(bytes);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, bytes);
  console.log(`main.ts: wrote ${bytes.length} bytes to ${outPath}`);
}

main();
