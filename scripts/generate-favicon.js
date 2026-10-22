const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create a 32x32 RGBA buffer for the CodingTime favicon
const WIDTH = 32;
const HEIGHT = 32;
const buffer = Buffer.alloc(WIDTH * HEIGHT * 4);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const idx = (y * WIDTH + x) * 4;
  buffer[idx] = r;
  buffer[idx + 1] = g;
  buffer[idx + 2] = b;
  buffer[idx + 3] = a;
}

function blendPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const idx = (y * WIDTH + x) * 4;
  const srcA = a / 255;
  const dstA = buffer[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;

  buffer[idx] = Math.round((r * srcA + buffer[idx] * dstA * (1 - srcA)) / outA);
  buffer[idx + 1] = Math.round((g * srcA + buffer[idx + 1] * dstA * (1 - srcA)) / outA);
  buffer[idx + 2] = Math.round((b * srcA + buffer[idx + 2] * dstA * (1 - srcA)) / outA);
  buffer[idx + 3] = Math.round(outA * 255);
}

// 1. Render squircle background
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    // Distance from rounded corners (radius 7)
    const rx = x < 7 ? 7 - x : (x > 24 ? x - 24 : 0);
    const ry = y < 7 ? 7 - y : (y > 24 ? y - 24 : 0);
    const dist = Math.sqrt(rx * rx + ry * ry);

    if (dist <= 7) {
      const alpha = dist > 6 ? Math.max(0, Math.min(1, 7 - dist)) : 1;
      // Dark slate navy gradient #0B0F19 to #0F172A
      const t = (x + y) / (WIDTH + HEIGHT);
      const r = Math.round(11 + t * 4);
      const g = Math.round(15 + t * 8);
      const b = Math.round(25 + t * 17);
      setPixel(x, y, r, g, b, Math.round(alpha * 255));
    }
  }
}

// 2. Render Time Arc (Cyan/Indigo)
const cx = 15.5;
const cy = 15.5;
const radius = 11.5;

for (let a = -Math.PI / 2; a < Math.PI * 0.8; a += 0.04) {
  const px = cx + radius * Math.cos(a);
  const py = cy + radius * Math.sin(a);
  const t = (a + Math.PI / 2) / (Math.PI * 1.3);
  // cyan (34, 211, 238) to indigo (129, 140, 248)
  const r = Math.round(34 + t * 95);
  const g = Math.round(211 - t * 71);
  const b = Math.round(238 + t * 10);
  blendPixel(Math.round(px), Math.round(py), r, g, b, 230);
  blendPixel(Math.floor(px), Math.floor(py), r, g, b, 150);
}

// 3. Render Left Bracket <
const leftLines = [
  [12, 11], [11, 12], [10, 13], [9, 14], [8, 15], [8, 16], [9, 17], [10, 18], [11, 19], [12, 20],
  [13, 11], [12, 12], [11, 13], [10, 14], [9, 15], [9, 16], [10, 17], [11, 18], [12, 19], [13, 20]
];
leftLines.forEach(([x, y]) => blendPixel(x, y, 56, 189, 248, 255));

// 4. Render Right Bracket >
const rightLines = [
  [19, 11], [20, 12], [21, 13], [22, 14], [23, 15], [23, 16], [22, 17], [21, 18], [20, 19], [19, 20],
  [18, 11], [19, 12], [20, 13], [21, 14], [22, 15], [22, 16], [21, 17], [20, 18], [19, 19], [18, 20]
];
rightLines.forEach(([x, y]) => blendPixel(x, y, 129, 140, 248, 255));

// 5. Render Central Clock Slash / Hand /
const slashLines = [
  [13, 21], [14, 19], [15, 17], [16, 15], [17, 13], [18, 11],
  [14, 21], [15, 19], [16, 17], [17, 15], [18, 13], [19, 11]
];
slashLines.forEach(([x, y]) => blendPixel(x, y, 52, 211, 153, 255));

// 6. Center glowing pivot dot
blendPixel(15, 15, 255, 255, 255, 255);
blendPixel(16, 15, 255, 255, 255, 255);
blendPixel(15, 16, 255, 255, 255, 255);
blendPixel(16, 16, 255, 255, 255, 255);

// Build PNG
function makePng(width, height, rgbaBuffer) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Scanlines with filter type 0 (None)
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    rawData[rowOffset] = 0; // filter None
    rgbaBuffer.copy(rawData, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const pngBuffer = makePng(WIDTH, HEIGHT, buffer);

// Save PNG
const publicDir = path.join(__dirname, '../apps/frontend/public');
const appDir = path.join(__dirname, '../apps/frontend/app');

fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pngBuffer);

// Build ICO containing the PNG
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // ICO format
icoHeader.writeUInt16LE(1, 4); // 1 image

const icoDir = Buffer.alloc(16);
icoDir.writeUInt8(WIDTH, 0);
icoDir.writeUInt8(HEIGHT, 1);
icoDir.writeUInt8(0, 2); // palette size
icoDir.writeUInt8(0, 3); // reserved
icoDir.writeUInt16LE(1, 4); // color planes
icoDir.writeUInt16LE(32, 6); // bpp
icoDir.writeUInt32LE(pngBuffer.length, 8); // size
icoDir.writeUInt32LE(22, 12); // offset (6 + 16 = 22)

const icoBuffer = Buffer.concat([icoHeader, icoDir, pngBuffer]);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
fs.writeFileSync(path.join(appDir, 'favicon.ico'), icoBuffer);

console.log('Successfully generated public/favicon.ico, app/favicon.ico, and public/apple-touch-icon.png!');
