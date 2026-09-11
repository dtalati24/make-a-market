#!/usr/bin/env node
/**
 * Generates every icon PNG for "Make a Market" from a few vector shapes.
 *
 *   node scripts/generate-icons.js [--preview <dir>]
 *
 * Deterministic and dependency-free (fs, path, zlib only). Shapes are signed
 * distance functions in pixel units (negative = inside). Pixels whose centre is
 * clearly inside/outside a shape are resolved from the SDF directly; edge pixels
 * are supersampled 16x16, which gives smooth anti-aliasing at every size.
 *
 * --preview <dir> additionally writes enlarged / composited copies of each
 * output (on a visible background) for eyeballing; they are not app assets.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const IMAGES = path.join(ROOT, 'assets', 'images');
const TAB_ICONS_DIR = path.join(IMAGES, 'tabIcons');

const COLORS = {
  ask: '#F05252', // coral red: the offer
  bid: '#22C55E', // green: the bid
  fair: '#FFFFFF', // white dot: fair value / settled price
  background: '#111827', // app background (dark navy)
  white: '#FFFFFF',
  black: '#000000',
};

// ---------------------------------------------------------------------------
// Shapes: { bbox: [x0, y0, x1, y1], sdf(x, y) -> signed distance }
// All SDFs are 1-Lipschitz, which the rasterizer relies on for its fast path.
// ---------------------------------------------------------------------------

function rect(x0, y0, x1, y1) {
  return roundRect(x0, y0, x1, y1, 0);
}

function roundRect(x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2;
  const hy = (y1 - y0) / 2;
  const rr = Math.min(r, hx, hy);
  return {
    bbox: [x0, y0, x1, y1],
    sdf(x, y) {
      const qx = Math.abs(x - cx) - hx + rr;
      const qy = Math.abs(y - cy) - hy + rr;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
    },
  };
}

function circle(cx, cy, r) {
  return {
    bbox: [cx - r, cy - r, cx + r, cy + r],
    sdf: (x, y) => Math.hypot(x - cx, y - cy) - r,
  };
}

/** Line segment of the given width with round caps (caps extend width/2 past the ends). */
function line(x0, y0, x1, y1, width) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const h = width / 2;
  return {
    bbox: [Math.min(x0, x1) - h, Math.min(y0, y1) - h, Math.max(x0, x1) + h, Math.max(y0, y1) + h],
    sdf(x, y) {
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
      return Math.hypot(x - x0 - t * dx, y - y0 - t * dy) - h;
    },
  };
}

/** Outline of a shape: a band of the given width centred on its edge. */
function stroke(shape, width) {
  const h = width / 2;
  const [x0, y0, x1, y1] = shape.bbox;
  return {
    bbox: [x0 - h, y0 - h, x1 + h, y1 + h],
    sdf: (x, y) => Math.abs(shape.sdf(x, y)) - h,
  };
}

/** Uniformly scale a shape about the origin (keeps the SDF exact). */
function scale(shape, k) {
  return {
    bbox: shape.bbox.map((v) => v * k),
    sdf: (x, y) => shape.sdf(x / k, y / k) * k,
  };
}

// ---------------------------------------------------------------------------
// Rasterizer
// ---------------------------------------------------------------------------

const SUBSAMPLES = 16; // per axis, for edge pixels only
const HALF_DIAGONAL = Math.SQRT1_2 + 1e-6;

/** Fraction of pixel (px, py) covered by the shape. */
function coverage(shape, px, py) {
  const d = shape.sdf(px + 0.5, py + 0.5);
  if (d <= -HALF_DIAGONAL) return 1;
  if (d >= HALF_DIAGONAL) return 0;
  let inside = 0;
  for (let j = 0; j < SUBSAMPLES; j++) {
    const y = py + (j + 0.5) / SUBSAMPLES;
    for (let i = 0; i < SUBSAMPLES; i++) {
      if (shape.sdf(px + (i + 0.5) / SUBSAMPLES, y) <= 0) inside++;
    }
  }
  return inside / (SUBSAMPLES * SUBSAMPLES);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Renders a w x h image. drawFn receives a context with:
 *   fill(shape, hexColor)  - paint shape over what is there
 *   erase(shape)           - punch shape out to transparency
 * Returns straight (non-premultiplied) RGBA8.
 */
function render(w, h, drawFn) {
  const px = new Float64Array(w * h * 4); // premultiplied RGBA, 0..1

  function forEachCovered(shape, fn) {
    const [bx0, by0, bx1, by1] = shape.bbox;
    const x0 = Math.max(0, Math.floor(bx0) - 1);
    const y0 = Math.max(0, Math.floor(by0) - 1);
    const x1 = Math.min(w - 1, Math.ceil(bx1) + 1);
    const y1 = Math.min(h - 1, Math.ceil(by1) + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = coverage(shape, x, y);
        if (c > 0) fn((y * w + x) * 4, c);
      }
    }
  }

  const ctx = {
    width: w,
    height: h,
    fill(shape, hex) {
      const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
      forEachCovered(shape, (i, a) => {
        px[i] = r * a + px[i] * (1 - a);
        px[i + 1] = g * a + px[i + 1] * (1 - a);
        px[i + 2] = b * a + px[i + 2] * (1 - a);
        px[i + 3] = a + px[i + 3] * (1 - a);
      });
    },
    erase(shape) {
      forEachCovered(shape, (i, a) => {
        for (let k = 0; k < 4; k++) px[i + k] *= 1 - a;
      });
    },
  };
  drawFn(ctx);

  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    const alpha8 = Math.round(a * 255);
    if (alpha8 === 0) continue; // fully transparent: leave as 0,0,0,0
    for (let k = 0; k < 3; k++) out[i + k] = Math.round(Math.min(1, px[i + k] / a) * 255);
    out[i + 3] = alpha8;
  }
  return out;
}

// ---------------------------------------------------------------------------
// PNG encoder (RGBA8, filter 0 on every row)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter type: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function writePng(file, w, h, rgba) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(w, h, rgba));
}

// ---------------------------------------------------------------------------
// Brand mark: ask bar (top), fair-value dot, bid bar (bottom)
// Proportions are fractions of the mark box size m; the mark itself is
// MARK.barW wide and (2 * barH + gap) tall, centred on the dot.
// ---------------------------------------------------------------------------

const MARK = {
  barW: 0.56,
  barH: 0.16,
  gap: 0.28, // between the bars; leaves (gap - dot) / 2 of air above and below the dot
  dot: 0.18,
};
const MARK_HEIGHT = 2 * MARK.barH + MARK.gap;

/** snap = round bar edges to whole pixels (crisper at favicon / notification sizes). */
function markShapes(cx, cy, m, snap = false) {
  const q = snap ? Math.round : (v) => v;
  const halfW = q((MARK.barW * m) / 2);
  const inner = q((MARK.gap * m) / 2); // dot centre -> near edge of each bar
  const outer = q(((MARK.gap + 2 * MARK.barH) * m) / 2); // dot centre -> far edge of each bar
  const r = (outer - inner) / 2; // fully rounded ends
  return {
    ask: roundRect(cx - halfW, cy - outer, cx + halfW, cy - inner, r),
    bid: roundRect(cx - halfW, cy + inner, cx + halfW, cy + outer, r),
    fair: circle(cx, cy, (MARK.dot * m) / 2),
  };
}

/** mono: paint every part in this one colour instead of the brand colours. */
function drawMark(ctx, cx, cy, m, { mono = null, snap = false } = {}) {
  const s = markShapes(cx, cy, m, snap);
  ctx.fill(s.ask, mono || COLORS.ask);
  ctx.fill(s.bid, mono || COLORS.bid);
  ctx.fill(s.fair, mono || COLORS.fair);
}

// ---------------------------------------------------------------------------
// Tab bar glyphs, designed on a 24x24 grid (2px stroke, 2px padding, round caps)
// ---------------------------------------------------------------------------

const TAB_GLYPHS = {
  // Two stacked pills (ask over bid) with the fair-value dot between: echoes the brand mark.
  markets: () => [
    stroke(roundRect(4, 3, 20, 7, 2), 2),
    circle(12, 12, 2),
    stroke(roundRect(4, 17, 20, 21, 2), 2),
  ],
  // Bar chart: three ascending bars standing over a baseline.
  stats: () => [
    line(4, 20, 20, 20, 2),
    line(7, 16, 7, 12, 2),
    line(12, 16, 12, 8, 2),
    line(17, 16, 17, 4, 2),
  ],
  // Sliders: three tracks, each with a knob at a different position.
  settings: () => [
    line(4, 5, 20, 5, 2),
    line(4, 12, 20, 12, 2),
    line(4, 19, 20, 19, 2),
    circle(15, 5, 3),
    circle(8, 12, 3),
    circle(13, 19, 3),
  ],
};

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

const SAFE_ZONE_DIAMETER = 0.55; // of the adaptive-icon canvas
const FULL = 1024;

// Mark box sizes, chosen from the fraction of the canvas the mark's height should fill.
const MARK_ICON = (0.58 * FULL) / MARK_HEIGHT;
const MARK_FOREGROUND = (0.41 * FULL) / MARK_HEIGHT; // must stay inside the adaptive safe zone
const MARK_SPLASH = (0.9 * FULL) / MARK_HEIGHT;

function outputs() {
  const c = FULL / 2;
  const list = [
    {
      file: path.join(IMAGES, 'icon.png'),
      size: FULL,
      preview: { bg: '#FFFFFF' },
      draw(ctx) {
        ctx.fill(rect(0, 0, FULL, FULL), COLORS.background);
        drawMark(ctx, c, c, MARK_ICON);
      },
      check: assertOpaque,
    },
    {
      file: path.join(IMAGES, 'android-icon-foreground.png'),
      size: FULL,
      preview: { adaptive: true },
      draw: (ctx) => drawMark(ctx, c, c, MARK_FOREGROUND),
      check: assertInsideSafeZone,
    },
    {
      file: path.join(IMAGES, 'android-icon-monochrome.png'),
      size: FULL,
      preview: { bg: '#3B4252' },
      draw: (ctx) => drawMark(ctx, c, c, MARK_FOREGROUND, { mono: COLORS.white }),
      check: (rgba, size) => {
        assertInsideSafeZone(rgba, size);
        assertSingleColor(rgba, COLORS.white);
      },
    },
    {
      file: path.join(IMAGES, 'splash-icon.png'),
      size: FULL,
      preview: { bg: COLORS.background },
      draw: (ctx) => drawMark(ctx, c, c, MARK_SPLASH),
    },
    {
      file: path.join(IMAGES, 'favicon.png'),
      size: 48,
      preview: { bg: '#FFFFFF' },
      draw(ctx) {
        ctx.fill(roundRect(0, 0, 48, 48, 0.22 * 48), COLORS.background);
        drawMark(ctx, 24, 24, 40, { snap: true });
      },
    },
    {
      file: path.join(IMAGES, 'notification-icon.png'),
      size: 96,
      preview: { bg: '#3B4252' },
      draw: (ctx) => drawMark(ctx, 48, 48, (0.8 * 96) / MARK_HEIGHT, { mono: COLORS.white, snap: true }),
      check: (rgba) => assertSingleColor(rgba, COLORS.white),
    },
  ];

  for (const [name, glyph] of Object.entries(TAB_GLYPHS)) {
    for (const [suffix, k] of [['', 1], ['@2x', 2], ['@3x', 3]]) {
      list.push({
        file: path.join(TAB_ICONS_DIR, `${name}${suffix}.png`),
        size: 24 * k,
        preview: { bg: '#FFFFFF' },
        draw(ctx) {
          for (const shape of glyph()) ctx.fill(scale(shape, k), COLORS.black);
        },
        check: (rgba) => assertSingleColor(rgba, COLORS.black),
      });
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// Checks (throw on failure)
// ---------------------------------------------------------------------------

function assertInsideSafeZone(rgba, size) {
  const c = size / 2;
  const radius = (SAFE_ZONE_DIAMETER * size) / 2;
  let maxReach = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rgba[(y * size + x) * 4 + 3] === 0) continue;
      // farthest corner of this pixel from the canvas centre
      const dx = Math.max(Math.abs(x - c), Math.abs(x + 1 - c));
      const dy = Math.max(Math.abs(y - c), Math.abs(y + 1 - c));
      maxReach = Math.max(maxReach, Math.hypot(dx, dy));
    }
  }
  if (maxReach > radius) {
    throw new Error(`Safe zone violated: mark reaches ${maxReach.toFixed(1)}px from centre, limit ${radius.toFixed(1)}px`);
  }
  console.log(`    safe zone ok: mark reaches ${maxReach.toFixed(1)}px of ${radius.toFixed(1)}px allowed`);
}

function assertOpaque(rgba) {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) throw new Error('Expected a fully opaque image');
  }
}

function assertSingleColor(rgba, hex) {
  const [r, g, b] = hexToRgb(hex);
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] !== 0 && (rgba[i] !== r || rgba[i + 1] !== g || rgba[i + 2] !== b)) {
      throw new Error(`Expected every visible pixel to be ${hex}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Previews (only with --preview): enlarged small icons on a solid background,
// and the adaptive foreground composited as a launcher would show it.
// ---------------------------------------------------------------------------

function flatten(rgba, bgHex) {
  const [br, bg, bb] = hexToRgb(bgHex);
  const out = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    out[i] = Math.round(rgba[i] * a + br * (1 - a));
    out[i + 1] = Math.round(rgba[i + 1] * a + bg * (1 - a));
    out[i + 2] = Math.round(rgba[i + 2] * a + bb * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

function upscale(rgba, size, k) {
  const n = size * k;
  const out = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      rgba.copy(out, (y * n + x) * 4, (((y / k) | 0) * size + ((x / k) | 0)) * 4, (((y / k) | 0) * size + ((x / k) | 0)) * 4 + 4);
    }
  }
  return out;
}

function writePreview(dir, item, rgba) {
  const base = path.basename(item.file, '.png');
  if (item.preview.adaptive) {
    // Launcher view: 72/108 of the canvas is visible, masked to a circle; the
    // yellow ring is the 0.55 safe zone.
    const img = render(item.size, item.size, (ctx) => {
      const c = item.size / 2;
      ctx.fill(rect(0, 0, item.size, item.size), '#9CA3AF');
      ctx.fill(circle(c, c, (item.size * 72) / 108 / 2), COLORS.background);
      item.draw(ctx);
      ctx.fill(stroke(circle(c, c, (SAFE_ZONE_DIAMETER * item.size) / 2), 3), '#FACC15');
    });
    writePng(path.join(dir, `${base}.preview.png`), item.size, item.size, img);
    return;
  }
  const k = Math.max(1, Math.floor(384 / item.size));
  const flat = flatten(rgba, item.preview.bg);
  writePng(path.join(dir, `${base}.preview.png`), item.size * k, item.size * k, upscale(flat, item.size, k));
}

// ---------------------------------------------------------------------------

function main() {
  const previewIdx = process.argv.indexOf('--preview');
  const previewDir = previewIdx !== -1 ? path.resolve(process.argv[previewIdx + 1]) : null;

  for (const item of outputs()) {
    const rgba = render(item.size, item.size, item.draw);
    console.log(`${path.relative(ROOT, item.file)}  ${item.size}x${item.size}`);
    if (item.check) item.check(rgba, item.size);
    writePng(item.file, item.size, item.size, rgba);
    if (previewDir) writePreview(previewDir, item, rgba);
  }
}

main();
