import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : (c >>> 1);
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function makeChunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10); ihdr.writeUInt8(0, 11); ihdr.writeUInt8(0, 12);
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0;
    rgbaBuffer.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = makeChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 }));
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, makeChunk('IHDR', ihdr), idat, iend]);
}

const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141724"/>
      <stop offset="50%" stop-color="#0f111a"/>
      <stop offset="100%" stop-color="#090a10"/>
    </linearGradient>

    <radialGradient id="ambientGlow" cx="62%" cy="38%" r="65%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.22"/>
      <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#090a10" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="glyphGrad" x1="15%" y1="15%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#939bf9"/>
      <stop offset="40%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>

    <radialGradient id="beaconGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="30%" stop-color="#7dd3fc"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </radialGradient>

    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.04)"/>
    </linearGradient>
  </defs>

  <!-- Container Squircle -->
  <rect x="4" y="4" width="120" height="120" rx="28" fill="url(#bgGrad)"/>
  <rect x="4" y="4" width="120" height="120" rx="28" fill="url(#ambientGlow)"/>
  <rect x="4" y="4" width="120" height="120" rx="28" fill="none" stroke="url(#borderGrad)" stroke-width="1.2"/>

  <!-- Radar Waves -->
  <circle cx="80" cy="47" r="23" fill="none" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.32"/>
  <circle cx="80" cy="47" r="14" fill="none" stroke="#818cf8" stroke-width="1.2" opacity="0.4"/>

  <!-- Geometric "R" Monogram -->
  <path d="M 28 32 C 28 29.8, 29.8 28, 32 28 L 68 28 C 84 28, 94 36, 94 47.5 C 94 59, 84 66, 68 66 L 44 66 L 44 96 C 44 98.2, 42.2 100, 40 100 L 32 100 C 29.8 100, 28 98.2, 28 96 Z" fill="url(#glyphGrad)"/>

  <!-- Loop Cutout -->
  <path d="M 44 41 L 66 41 C 73 41, 78 43.5, 78 47.5 C 78 51.5, 73 54, 66 54 L 44 54 Z" fill="#0f111a"/>

  <!-- Diagonal Leg -->
  <path d="M 56 60 L 85 100 L 100 100 L 70 58 Z" fill="url(#glyphGrad)"/>

  <!-- Precision Scanner Beacon -->
  <circle cx="80" cy="47" r="4.5" fill="url(#beaconGrad)"/>
  <circle cx="80" cy="47" r="1.8" fill="#ffffff"/>
</svg>`;

const assetsDir = path.resolve('extension/assets');
fs.writeFileSync(path.join(assetsDir, 'ramos-icon.svg'), masterSvg, 'utf8');

function rasterizeIcon(size) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);

  function isInsideRoundedRect(x, y, rx, ry, rw, rh, r) {
    if (x < rx || x > rx + rw || y < ry || y > ry + rh) return false;
    let dx = 0, dy = 0;
    if (x < rx + r) dx = rx + r - x;
    else if (x > rx + rw - r) dx = x - (rx + rw - r);
    if (y < ry + r) dy = ry + r - y;
    else if (y > ry + rh - r) dy = y - (ry + rh - r);
    return (dx * dx + dy * dy) <= (r * r);
  }

  function distSq(x1, y1, x2, y2) {
    return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
  }

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;

      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const fx = ((px * ss + sx + 0.5) / (size * ss)) * 128;
          const fy = ((py * ss + sy + 0.5) / (size * ss)) * 128;

          if (!isInsideRoundedRect(fx, fy, 4, 4, 120, 120, 28)) {
            continue;
          }

          const t = (fx + fy) / 256;
          let r = Math.round(20 * (1 - t) + 9 * t);
          let g = Math.round(23 * (1 - t) + 10 * t);
          let b = Math.round(36 * (1 - t) + 16 * t);
          let a = 255;

          const dGlow = Math.sqrt(distSq(fx, fy, 76, 48));
          if (dGlow < 65) {
            const glowFactor = (1 - dGlow / 65) * 0.22;
            r = Math.min(255, r + Math.round(99 * glowFactor));
            g = Math.min(255, g + Math.round(102 * glowFactor));
            b = Math.min(255, b + Math.round(241 * glowFactor));
          }

          const isBorder = !isInsideRoundedRect(fx, fy, 5.2, 5.2, 117.6, 117.6, 26.8);
          if (isBorder) {
            const borderAlpha = Math.max(0, 0.22 * (1 - fy / 128));
            r = Math.min(255, r + Math.round(255 * borderAlpha));
            g = Math.min(255, g + Math.round(255 * borderAlpha));
            b = Math.min(255, b + Math.round(255 * borderAlpha));
          }

          // Radar rings around (80, 47)
          const dRadar = Math.sqrt(distSq(fx, fy, 80, 47));
          if (Math.abs(dRadar - 23) < 0.9) {
            r = Math.min(255, r + 45); g = Math.min(255, g + 85); b = Math.min(255, b + 115);
          }
          if (Math.abs(dRadar - 14) < 0.9) {
            r = Math.min(255, r + 65); g = Math.min(255, g + 80); b = Math.min(255, b + 130);
          }

          let inGlyph = false;

          // 1. Pillar and Top Bar unified
          // Left pillar: x: 28..44, y: 28..100
          if (fx >= 28 && fx <= 44 && fy >= 28 && fy <= 100) {
            let corner = true;
            if (fx < 32 && fy < 32 && distSq(fx, fy, 32, 32) > 16) corner = false;
            if (fx < 32 && fy > 96 && distSq(fx, fy, 32, 96) > 16) corner = false;
            if (fx > 40 && fy > 96 && distSq(fx, fy, 40, 96) > 16) corner = false;
            if (corner) inGlyph = true;
          }

          // 2. Loop outer: x: 44..68 rect, plus semicircular arc to x=94, y: 28..66
          if (fx >= 44 && fx <= 68 && fy >= 28 && fy <= 66) {
            inGlyph = true;
          } else if (fx > 68 && fx <= 94 && fy >= 28 && fy <= 66) {
            const dx = (fx - 68) / 26;
            const dy = (fy - 47) / 19;
            if (dx * dx + dy * dy <= 1) {
              inGlyph = true;
            }
          }

          // Loop inner cutout: x: 44..66, y: 41..54, arc to x=78
          if (inGlyph) {
            if (fx >= 44 && fx <= 66 && fy >= 41 && fy <= 54) {
              inGlyph = false;
            } else if (fx > 66 && fx <= 78 && fy >= 41 && fy <= 54) {
              const dx = (fx - 66) / 12;
              const dy = (fy - 47.5) / 6.5;
              if (dx * dx + dy * dy <= 1) {
                inGlyph = false;
              }
            }
          }

          // 3. Diagonal Leg: from (56, 60) -> (85, 100) -> (100, 100) -> (70, 58)
          if (!inGlyph && fy >= 58 && fy <= 100) {
            const leftX = 56 + (fy - 58) * (29 / 42);
            const rightX = 70 + (fy - 58) * (30 / 42);
            if (fx >= leftX && fx <= rightX) {
              inGlyph = true;
            }
          }

          if (inGlyph) {
            const gt = Math.min(1, Math.max(0, (fx - 28 + (fy - 28) * 0.5) / 95));
            let gr, gg, gb;
            if (gt < 0.45) {
              const u = gt / 0.45;
              gr = Math.round(147 * (1 - u) + 99 * u);
              gg = Math.round(155 * (1 - u) + 102 * u);
              gb = Math.round(249 * (1 - u) + 241 * u);
            } else {
              const u = (gt - 0.45) / 0.55;
              gr = Math.round(99 * (1 - u) + 56 * u);
              gg = Math.round(102 * (1 - u) + 189 * u);
              gb = Math.round(241 * (1 - u) + 248 * u);
            }
            r = gr; g = gg; b = gb;
          }

          // Precision Beacon Core (80, 47)
          const dBeacon = Math.sqrt(distSq(fx, fy, 80, 47));
          if (dBeacon <= 4.5) {
            const bt = dBeacon / 4.5;
            r = Math.round(255 * (1 - bt) + 56 * bt);
            g = Math.round(255 * (1 - bt) + 189 * bt);
            b = 255;
          }

          rSum += r;
          gSum += g;
          bSum += b;
          aSum += a;
        }
      }

      const count = ss * ss;
      const idx = (py * size + px) * 4;
      buf[idx] = Math.round(rSum / count);
      buf[idx + 1] = Math.round(gSum / count);
      buf[idx + 2] = Math.round(bSum / count);
      buf[idx + 3] = Math.round(aSum / count);
    }
  }

  return createPng(size, size, buf);
}

const sizes = [16, 32, 48, 128];
for (const s of sizes) {
  const pngData = rasterizeIcon(s);
  const outPath = path.join(assetsDir, `ramos-icon-${s}.png`);
  fs.writeFileSync(outPath, pngData);
}
console.log('Successfully re-generated all brand icons with seamless geometry!');
