// Generates PWA icons into public/icons/ — run: node scripts/generate-icons.mjs
// Dependency-free PNG encoder (zlib) + SDF rasterizer so icons stay reproducible.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, v) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// Signed distance to a rotated rounded box (card shape).
function sdRoundBox(px, py, cx, cy, hw, hh, r, rot) {
  const dx = px - cx;
  const dy = py - cy;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const qx = Math.abs(lx) - hw + r;
  const qy = Math.abs(ly) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Local-space coords of a rotated box (for drawing the pip inside the card).
function toLocal(px, py, cx, cy, rot) {
  const dx = px - cx;
  const dy = py - cy;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

const FELT = [11, 61, 46]; // #0b3d2e
const FELT_DARK = [7, 42, 32]; // #072a20
const CARD = [250, 252, 247];
const CARD_BACK = [223, 229, 216];
const RED = [197, 58, 50];
const SHADOW = [4, 24, 19];

/**
 * Render the icon: felt field with vignette, two-card fan, red diamond pip.
 * @param {number} size px, square
 * @param {boolean} maskable shrink artwork into the 80% safe zone
 */
function render(size, maskable) {
  const s = size / 512;
  const g = maskable ? 0.62 : 1; // artwork group scale
  const cx = size / 2;
  const cy = size / 2;
  const px = Buffer.alloc(size * size * 4);

  const hw = 105 * s * g;
  const hh = 146 * s * g;
  const r = 20 * s * g;
  const aa = Math.max(1.2, 1.8 * s);

  const backCx = cx - 42 * s * g;
  const backCy = cy - 30 * s * g;
  const backRot = (-14 * Math.PI) / 180;
  const frontCx = cx + 20 * s * g;
  const frontCy = cy + 16 * s * g;
  const frontRot = (8 * Math.PI) / 180;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Felt background with radial vignette.
      const dc = Math.hypot(x - cx, y - cy) / (size * 0.72);
      const v = smoothstep(0.25, 1, dc);
      let cr = lerp(FELT[0], FELT_DARK[0], v);
      let cg = lerp(FELT[1], FELT_DARK[1], v);
      let cb = lerp(FELT[2], FELT_DARK[2], v);

      // Soft shadow under the card fan.
      const dShadow = sdRoundBox(x, y, frontCx + 4 * s, frontCy + 14 * s, hw, hh, r, frontRot);
      const aShadow = clamp01(0.5 - dShadow / (10 * s)) * 0.45;
      cr = lerp(cr, SHADOW[0], aShadow);
      cg = lerp(cg, SHADOW[1], aShadow);
      cb = lerp(cb, SHADOW[2], aShadow);

      // Back card.
      const dBack = sdRoundBox(x, y, backCx, backCy, hw, hh, r, backRot);
      const aBack = clamp01(0.5 - dBack / aa);
      cr = lerp(cr, CARD_BACK[0], aBack);
      cg = lerp(cg, CARD_BACK[1], aBack);
      cb = lerp(cb, CARD_BACK[2], aBack);

      // Front card.
      const dFront = sdRoundBox(x, y, frontCx, frontCy, hw, hh, r, frontRot);
      const aFront = clamp01(0.5 - dFront / aa);
      cr = lerp(cr, CARD[0], aFront);
      cg = lerp(cg, CARD[1], aFront);
      cb = lerp(cb, CARD[2], aFront);

      // Diamond pip centered on the front card.
      if (aFront > 0) {
        const [lx, ly] = toLocal(x, y, frontCx, frontCy, frontRot);
        const t = Math.abs(lx) / (44 * s * g) + Math.abs(ly) / (60 * s * g);
        const aPip = clamp01((1 - t) * ((44 * s * g) / aa)) * aFront;
        cr = lerp(cr, RED[0], aPip);
        cg = lerp(cg, RED[1], aPip);
        cb = lerp(cb, RED[2], aPip);
      }

      px[i] = Math.round(cr);
      px[i + 1] = Math.round(cg);
      px[i + 2] = Math.round(cb);
      px[i + 3] = 255;
    }
  }
  return px;
}

mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-180.png', 180, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true]
];

for (const [name, size, maskable] of targets) {
  const png = encodePNG(size, size, render(size, maskable));
  writeFileSync(join(outDir, name), png);
  console.log(`wrote ${name} (${size}x${size}${maskable ? ', maskable' : ''})`);
}
