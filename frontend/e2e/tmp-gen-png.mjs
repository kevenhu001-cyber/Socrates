// tmp-gen-png.mjs — TEMPORARY: regenerate valid test PNGs (correct CRC32).
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

function crc32(buf) {
  return zlib.crc32(buf) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(w, h, rgbFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  // rows: filter byte 0 + w*3
  const rowLen = w * 3 + 1;
  const raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = rgbFn(x, y, w, h);
      const o = y * rowLen + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* --- grad: 600×600 smooth gradient (small control) --- */
const grad = encodePng(600, 600, (x, y, w, h) => [
  Math.round(255 * x / w), Math.round(255 * y / h), Math.round(128 + 127 * Math.sin(x / 47)),
]);
fs.writeFileSync(new URL('./tmp-diag-grad.png', import.meta.url), grad);

/* --- photo: 4000×3000 large smooth photo-like gradient --- */
const photo = encodePng(4000, 3000, (x, y, w, h) => [
  Math.round(255 * x / w),
  Math.round(255 * y / h),
  Math.round(127 + 128 * Math.sin(x / 197) * Math.cos(y / 151)),
]);
fs.writeFileSync(new URL('./tmp-diag-photo.png', import.meta.url), photo);

/* --- mixed: 1200×1200 gradient + noise patches (compression-triggering) --- */
const mixed = encodePng(1200, 1200, (x, y, w, h) => {
  if (x % 160 < 80 && y % 160 < 80) {
    const rnd = crypto.randomBytes(3);
    return [rnd[0], rnd[1], rnd[2]];
  }
  return [
    Math.round(255 * x / w), Math.round(255 * y / h), Math.round(127 + 127 * Math.sin(x / 37)),
  ];
});
fs.writeFileSync(new URL('./tmp-diag-mixed.png', import.meta.url), mixed);

/* --- noise: 1200×1200 pure noise (>4MB limit) --- */
const noise = encodePng(1200, 1200, () => {
  const rnd = crypto.randomBytes(3);
  return [rnd[0], rnd[1], rnd[2]];
});
fs.writeFileSync(new URL('./tmp-diag-noise.png', import.meta.url), noise);

for (const f of ['tmp-diag-grad.png', 'tmp-diag-photo.png', 'tmp-diag-mixed.png', 'tmp-diag-noise.png']) {
  const b = fs.readFileSync(new URL('./' + f, import.meta.url));
  console.log(f, Math.round(b.length / 1024) + 'KB');
}
