#!/usr/bin/env node
/**
 * Generates the Orbit app icon (1024×1024 PNG) with no image
 * dependencies: a dark rounded square with a spectrum orbit ring and a
 * satellite dot. Run `npm run icon` afterwards to derive all platform
 * icons via the Tauri CLI.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;
const CENTER = SIZE / 2;
const CORNER_RADIUS = 232;
const RING_RADIUS = 300;
const RING_WIDTH = 86;
const DOT_ANGLE = -55; // degrees, 0 = 12 o'clock, clockwise
const DOT_RADIUS = 62;

// Ring palette: Claude warm orange → Codex indigo → Antigravity spectrum.
const STOPS = [
  [0.0, 0xe6, 0x7d, 0x22],
  [0.14, 0xde, 0x73, 0x56],
  [0.3, 0x81, 0x88, 0xff],
  [0.46, 0x59, 0x6a, 0xf7],
  [0.6, 0x37, 0xaf, 0xc3],
  [0.74, 0x55, 0xbc, 0x70],
  [0.88, 0xf5, 0x9a, 0x2a],
  [1.0, 0xe6, 0x7d, 0x22],
];

function ringColor(t) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, r0, g0, b0] = STOPS[i];
    const [t1, r1, g1, b1] = STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return STOPS[0].slice(1);
}

/** Signed distance to a rounded-square boundary (negative = inside). */
function roundedSquareDistance(x, y) {
  const dx = Math.max(Math.abs(x - CENTER) - (CENTER - CORNER_RADIUS), 0);
  const dy = Math.max(Math.abs(y - CENTER) - (CENTER - CORNER_RADIUS), 0);
  return Math.hypot(dx, dy) - CORNER_RADIUS;
}

const smooth = (d) => Math.min(1, Math.max(0, 0.5 - d / 2)); // 2px AA

const pixels = Buffer.alloc(SIZE * SIZE * 4);

const dotAngleRad = ((DOT_ANGLE - 90) * Math.PI) / 180;
const dotX = CENTER + RING_RADIUS * Math.cos(dotAngleRad);
const dotY = CENTER + RING_RADIUS * Math.sin(dotAngleRad);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;
    const shapeAlpha = smooth(roundedSquareDistance(x, y));
    if (shapeAlpha === 0) continue;

    // Background: deep indigo-charcoal with a gentle vertical gradient.
    const g = y / SIZE;
    let r = 30 + 8 * g;
    let gg = 27 + 6 * g;
    let b = 44 + 12 * g;

    // Orbit ring, colored by angle from 12 o'clock clockwise.
    const dist = Math.hypot(x - CENTER, y - CENTER);
    const ringAlpha = smooth(Math.abs(dist - RING_RADIUS) - RING_WIDTH / 2);
    if (ringAlpha > 0) {
      let angle = Math.atan2(x - CENTER, CENTER - y); // 0 at top, cw
      if (angle < 0) angle += Math.PI * 2;
      const [rr, rg, rb] = ringColor(angle / (Math.PI * 2));
      r = r + (rr - r) * ringAlpha;
      gg = gg + (rg - gg) * ringAlpha;
      b = b + (rb - b) * ringAlpha;
    }

    // Satellite dot riding the ring, with a thin background halo.
    const dDot = Math.hypot(x - dotX, y - dotY);
    const haloAlpha = smooth(dDot - (DOT_RADIUS + 26));
    if (haloAlpha > 0 && ringAlpha > 0) {
      const bgR = 30 + 8 * g;
      const bgG = 27 + 6 * g;
      const bgB = 44 + 12 * g;
      r = r + (bgR - r) * haloAlpha;
      gg = gg + (bgG - gg) * haloAlpha;
      b = b + (bgB - b) * haloAlpha;
    }
    const dotAlpha = smooth(dDot - DOT_RADIUS);
    if (dotAlpha > 0) {
      r = r + (247 - r) * dotAlpha;
      gg = gg + (245 - gg) * dotAlpha;
      b = b + (252 - b) * dotAlpha;
    }

    pixels[idx] = Math.round(r);
    pixels[idx + 1] = Math.round(gg);
    pixels[idx + 2] = Math.round(b);
    pixels[idx + 3] = Math.round(255 * shapeAlpha);
  }
}

// ── Minimal PNG encoder ─────────────────────────────────────────────
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "assets", "icon-source.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
