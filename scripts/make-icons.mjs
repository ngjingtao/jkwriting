// Generates the app icons with no external dependencies.
// Usage: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SS = 3; // supersampling

/* ------------------------------- PNG writer ------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
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

function writePng(file, width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

/* -------------------------------- drawing -------------------------------- */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;

function roundedRectSdf(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

function render(size) {
  const W = size * SS;
  const px = Buffer.alloc(W * W * 4);

  const put = (i, r, g, b, a) => {
    if (a <= 0) return;
    const o = i * 4;
    const alpha = clamp(a, 0, 1);
    px[o] = Math.round(mix(px[o], r, alpha));
    px[o + 1] = Math.round(mix(px[o + 1], g, alpha));
    px[o + 2] = Math.round(mix(px[o + 2], b, alpha));
    px[o + 3] = Math.round(mix(px[o + 3], 255, alpha));
  };

  const scale = W / 512;

  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const u = x / scale;
      const v = y / scale;

      const bg = roundedRectSdf(u, v, 256, 256, 512, 512, 116);
      if (bg <= 0) {
        const t = clamp((u + v) / 1024, 0, 1);
        let r = mix(91, 124, t);
        let g = mix(84, 58, t);
        let b = mix(240, 237, t);
        // warm glow bottom-left
        const glow = Math.max(0, 1 - Math.hypot(u - 90, v - 450) / 250) * 0.35;
        r = mix(r, 249, glow);
        g = mix(g, 115, glow);
        b = mix(b, 22, glow);
        const edge = clamp(-bg / (2 * scale), 0, 1);
        px[i * 4] = Math.round(r);
        px[i * 4 + 1] = Math.round(g);
        px[i * 4 + 2] = Math.round(b);
        px[i * 4 + 3] = Math.round(255 * edge);
      }
    }
  }

  // writing grid
  const gridPx = 7 * scale;
  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const u = x / scale;
      const v = y / scale;
      const i = y * W + x;

      const outer = Math.abs(roundedRectSdf(u, v, 256, 256, 336, 336, 52)) - gridPx / 2;
      if (outer <= 0) {
        const edge = clamp(-outer / (1.6 * scale), 0, 1);
        put(i, 255, 255, 255, 0.5 * edge);
      }

      // dashed cross
      const dash = ((u + v) % 46) < 26;
      if (dash) {
        const lw = 3.4;
        const vert = Math.abs(u - 256) < lw && Math.abs(v - 256) < 148;
        const horz = Math.abs(v - 256) < lw && Math.abs(u - 256) < 148;
        if (vert || horz) put(i, 255, 255, 255, 0.32);
      }
    }
  }

  // three brush strokes (三)
  const bars = [
    { y: 178, x1: 170, x2: 344, h: 34 },
    { y: 256, x1: 190, x2: 324, h: 34 },
    { y: 334, x1: 152, x2: 362, h: 34 },
  ];
  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const u = x / scale;
      const v = y / scale;
      const i = y * W + x;
      for (const bar of bars) {
        const d = roundedRectSdf(u, v, (bar.x1 + bar.x2) / 2, bar.y, bar.x2 - bar.x1, bar.h, bar.h / 2);
        if (d <= 0) put(i, 255, 255, 255, 0.97);
      }
    }
  }

  // red start dot on the first stroke
  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const u = x / scale;
      const v = y / scale;
      const i = y * W + x;
      const d = Math.hypot(u - 172, v - 178);
      if (d < 26) put(i, 249, 115, 22, d < 19 ? 1 : clamp((26 - d) / 7, 0, 1));
      if (d > 31 && d < 36) put(i, 255, 255, 255, 0.9);
    }
  }

  // downsample
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const o = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          r += px[o];
          g += px[o + 1];
          b += px[o + 2];
          a += px[o + 3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [180, 192, 512]) {
  const pixels = render(size);
  writePng(path.join(OUT, `icon-${size}.png`), size, size, pixels);
  console.log(`icons/icon-${size}.png`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b54f0"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="116" fill="url(#g)"/>
  <rect x="88" y="88" width="336" height="336" rx="52" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="7"/>
  <path d="M256 108v296M108 256h296" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-dasharray="26 20"/>
  <g fill="#fff">
    <rect x="170" y="161" width="174" height="34" rx="17"/>
    <rect x="190" y="239" width="134" height="34" rx="17"/>
    <rect x="152" y="317" width="210" height="34" rx="17"/>
  </g>
  <circle cx="172" cy="178" r="19" fill="#f97316" stroke="#fff" stroke-width="6"/>
</svg>
`;
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg);
console.log('icons/icon.svg');
