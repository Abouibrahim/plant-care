// Generates the PWA icons without any image dependency: a leaf on a green tile.
// Run with `npm run icons`; the PNGs are committed under public/icons.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const BG = [0x2f, 0x6b, 0x3a];
const LEAF = [0xbf, 0xe8, 0x9a];
const VEIN = [0x2f, 0x6b, 0x3a];

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Samples one point: returns [r,g,b,a] in 0..255. `maskable` fills the whole square. */
function sample(x, y, size, maskable) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  // Background: rounded square (radius 22%) or full bleed.
  let bgAlpha = 1;
  if (!maskable) {
    const rad = size * 0.22;
    const dx = Math.max(Math.abs(x - cx) - (r - rad), 0);
    const dy = Math.max(Math.abs(y - cy) - (r - rad), 0);
    bgAlpha = Math.hypot(dx, dy) <= rad ? 1 : 0;
  }
  if (bgAlpha === 0) return [0, 0, 0, 0];

  // Leaf: a pointed ellipse rotated 45 degrees, inside the maskable safe zone (80%).
  const scale = maskable ? 0.62 : 0.78;
  const u = (x - cx) / (r * scale);
  const v = (y - cy) / (r * scale);
  const s = Math.SQRT1_2;
  const lu = (u + v) * s; // along the leaf
  const lv = (v - u) * s; // across the leaf
  const a = 0.95;
  const b = 0.48;
  const inside = Math.abs(lu) <= a && Math.abs(lv) <= b * (1 - (lu / a) ** 2);
  if (!inside) return [...BG, 255];
  const onVein = Math.abs(lv) < 0.035 && Math.abs(lu) < a * 0.92;
  return onVein ? [...VEIN, 255] : [...LEAF, 255];
}

function render(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 3; // supersampling per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = sample(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, size, maskable);
          r += px[0] * px[3];
          g += px[1] * px[3];
          b += px[2] * px[3];
          a += px[3];
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round(a / (ss * ss));
    }
  }
  return png(size, size, rgba);
}

writeFileSync(path.join(outDir, "icon-192.png"), render(192, false));
writeFileSync(path.join(outDir, "icon-512.png"), render(512, false));
writeFileSync(path.join(outDir, "maskable-512.png"), render(512, true));
console.log("icons written to", outDir);
