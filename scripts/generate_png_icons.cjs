const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create CRC table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createTasksIconPng(size) {
  // RGBA buffer (size * size * 4) + filter bytes (1 byte per scanline)
  const raw = Buffer.alloc(size * (size * 4 + 1), 0);

  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 512;

  // Helper to set pixel RGBA
  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const prevA = raw[offset + 3] / 255;
    const srcA = a / 255;
    const outA = srcA + prevA * (1 - srcA);
    if (outA > 0) {
      raw[offset] = Math.round((r * srcA + raw[offset] * prevA * (1 - srcA)) / outA);
      raw[offset + 1] = Math.round((g * srcA + raw[offset + 1] * prevA * (1 - srcA)) / outA);
      raw[offset + 2] = Math.round((b * srcA + raw[offset + 2] * prevA * (1 - srcA)) / outA);
      raw[offset + 3] = Math.round(outA * 255);
    }
  }

  // Draw thick line
  function drawLine(x0, y0, x1, y1, width, r, g, b, a) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.ceil(len * 2);
    const rad = width / 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      for (let ox = -rad; ox <= rad; ox++) {
        for (let oy = -rad; oy <= rad; oy++) {
          if (ox * ox + oy * oy <= rad * rad) {
            setPixel(Math.round(px + ox), Math.round(py + oy), r, g, b, a);
          }
        }
      }
    }
  }

  // Draw rounded rect outline
  function drawRoundedRectOutline(rx0, ry0, w, h, radius, strokeW, r, g, b, a) {
    // Top & Bottom
    drawLine(rx0 + radius, ry0, rx0 + w - radius, ry0, strokeW, r, g, b, a);
    drawLine(rx0 + radius, ry0 + h, rx0 + w - radius, ry0 + h, strokeW, r, g, b, a);
    // Left & Right
    drawLine(rx0, ry0 + radius, rx0, ry0 + h - radius, strokeW, r, g, b, a);
    drawLine(rx0 + w, ry0 + radius, rx0 + w, ry0 + h - radius, strokeW, r, g, b, a);
    
    // Corners
    const corners = [
      { cx: rx0 + radius, cy: ry0 + radius, sa: Math.PI, ea: 1.5 * Math.PI },
      { cx: rx0 + w - radius, cy: ry0 + radius, sa: 1.5 * Math.PI, ea: 2 * Math.PI },
      { cx: rx0 + w - radius, cy: ry0 + h - radius, sa: 0, ea: 0.5 * Math.PI },
      { cx: rx0 + radius, cy: ry0 + h - radius, sa: 0.5 * Math.PI, ea: Math.PI },
    ];
    corners.forEach(c => {
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const ang = c.sa + (c.ea - c.sa) * (i / steps);
        const px = c.cx + Math.cos(ang) * radius;
        const py = c.cy + Math.sin(ang) * radius;
        const rad = strokeW / 2;
        for (let ox = -rad; ox <= rad; ox++) {
          for (let oy = -rad; oy <= rad; oy++) {
            if (ox * ox + oy * oy <= rad * rad) {
              setPixel(Math.round(px + ox), Math.round(py + oy), r, g, b, a);
            }
          }
        }
      }
    });
  }

  // Draw fill for clipboard body (subtle dark transparent plate or clean outline)
  const boardX = 80 * scale;
  const boardY = 96 * scale;
  const boardW = 352 * scale;
  const boardH = 368 * scale;
  const boardR = 48 * scale;
  const strokeW = Math.max(2, 24 * scale);

  // Soft modern dark background inside board with rounded corners
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x >= boardX && x <= boardX + boardW && y >= boardY && y <= boardY + boardH) {
        const dx = Math.max(0, Math.max(boardX + boardR - x, x - (boardX + boardW - boardR)));
        const dy = Math.max(0, Math.max(boardY + boardR - y, y - (boardY + boardH - boardR)));
        if (dx * dx + dy * dy <= boardR * boardR) {
          setPixel(x, y, 15, 23, 42, 230); // Deep slate plate
        }
      }
    }
  }

  // Draw Board Outline (Datlion Cnergy Green #8EBF45 -> R:142, G:191, B:69)
  drawRoundedRectOutline(boardX, boardY, boardW, boardH, boardR, strokeW, 142, 191, 69, 255);

  // Draw Top Clip
  const clipX = 184 * scale;
  const clipY = 48 * scale;
  const clipW = 144 * scale;
  const clipH = 64 * scale;
  const clipR = 18 * scale;
  drawRoundedRectOutline(clipX, clipY, clipW, clipH, clipR, strokeW * 0.85, 142, 191, 69, 255);

  // Checkmark 1
  drawLine(140 * scale, 200 * scale, 180 * scale, 240 * scale, strokeW * 1.1, 142, 191, 69, 255);
  drawLine(180 * scale, 240 * scale, 250 * scale, 170 * scale, strokeW * 1.1, 142, 191, 69, 255);
  drawLine(280 * scale, 205 * scale, 380 * scale, 205 * scale, strokeW * 0.85, 255, 255, 255, 255);

  // Checkmark 2
  drawLine(140 * scale, 305 * scale, 180 * scale, 345 * scale, strokeW * 1.1, 142, 191, 69, 255);
  drawLine(180 * scale, 345 * scale, 250 * scale, 275 * scale, strokeW * 1.1, 142, 191, 69, 255);
  drawLine(280 * scale, 310 * scale, 380 * scale, 310 * scale, strokeW * 0.85, 255, 255, 255, 255);

  // Task Line 3
  const c3x = 160 * scale;
  const c3y = 400 * scale;
  const c3r = 14 * scale;
  for (let ox = -c3r; ox <= c3r; ox++) {
    for (let oy = -c3r; oy <= c3r; oy++) {
      const d2 = ox * ox + oy * oy;
      if (d2 <= c3r * c3r && d2 >= (c3r - strokeW * 0.7) * (c3r - strokeW * 0.7)) {
        setPixel(Math.round(c3x + ox), Math.round(c3y + oy), 142, 191, 69, 255);
      }
    }
  }
  drawLine(210 * scale, 400 * scale, 380 * scale, 400 * scale, strokeW * 0.85, 148, 163, 184, 255);

  // PNG Compression
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function writeAllPngIcons() {
  const p192 = createTasksIconPng(192);
  const p512 = createTasksIconPng(512);

  const publicDir = path.join(__dirname, '..', 'public');
  const rootDir = path.join(__dirname, '..');

  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), p192);
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), p512);
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), p192);
  fs.writeFileSync(path.join(publicDir, 'favicon.png'), p192);

  fs.writeFileSync(path.join(rootDir, 'icon-192.png'), p192);
  fs.writeFileSync(path.join(rootDir, 'icon-512.png'), p512);

  console.log('Successfully generated transparent tasks PNG icons for 192x192 and 512x512!');
}

writeAllPngIcons();
