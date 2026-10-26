// Draws the toolbar icons straight to PNG, with no dependencies: the Thorn Glass, a cocktail
// glass with death-metal thorns and drips, white on a black tile, with a green square for the
// olive on the centre thorn. Run from the repo root: node scripts/make-icons.mjs (it writes
// public/icons/, which the build copies as they are).
//
// There are three drawings: a detailed one on a 128 grid for 48 and 128 px, and pixel-grid ones
// for 32 and 16 px, so the toolbar icon stays crisp instead of being a blurry shrink. Shapes are
// rects [x, y, width, height] or triangles [[x, y], [x, y], [x, y]], painted in layer order.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SAMPLES = 4;
const BLACK = [0, 0, 0];
const WHITE = [241, 239, 232];
const GREEN = [52, 211, 153];

const mirror = (grid, [[ax, ay], [bx, by], [cx, cy]]) => [
  [grid - ax, ay],
  [grid - bx, by],
  [grid - cx, cy],
];
const pair = (grid, triangle) => [triangle, mirror(grid, triangle)];

const FULL = {
  grid: 128,
  layers: [
    [
      WHITE,
      [
        [22, 30, 84, 6],
        ...pair(128, [
          [22, 30],
          [3, 33],
          [22, 36],
        ]),
        ...pair(128, [
          [27, 30],
          [18, 12],
          [35, 30],
        ]),
        ...pair(128, [
          [43, 30],
          [41, 18],
          [50, 30],
        ]),
        [
          [64, 2],
          [58.5, 30],
          [69.5, 30],
        ],
        [
          [24, 39],
          [104, 39],
          [64, 80],
        ],
        [61, 78, 6, 28],
        ...pair(128, [
          [61, 86],
          [51, 80],
          [61, 92],
        ]),
        ...pair(128, [
          [61, 97],
          [54, 94],
          [61, 102],
        ]),
        [40, 105, 48, 6],
        ...pair(128, [
          [40, 105],
          [27, 108],
          [40, 111],
        ]),
        [
          [59, 111],
          [64, 126],
          [69, 111],
        ],
        ...pair(128, [
          [44, 111],
          [46, 120],
          [51, 111],
        ]),
      ],
    ],
    // Drips hanging from the rim into the bowl.
    [
      BLACK,
      [
        [
          [60.5, 39],
          [67.5, 39],
          [64, 66],
        ],
        ...pair(128, [
          [37, 39],
          [44, 39],
          [42.5, 52],
        ]),
      ],
    ],
    [GREEN, [[57.5, 9, 13, 13]]],
  ],
};

const PX32 = {
  grid: 32,
  layers: [
    [
      WHITE,
      [
        [
          [14, 9],
          [16, 0],
          [18, 9],
        ],
        [4, 9, 24, 2],
        ...pair(32, [
          [4, 9],
          [0, 10],
          [4, 11],
        ]),
        ...pair(32, [
          [5, 9],
          [3, 3],
          [8, 9],
        ]),
        ...pair(32, [
          [10, 9],
          [10, 5],
          [12, 9],
        ]),
        [
          [5, 12],
          [27, 12],
          [16, 22],
        ],
        [15, 21, 2, 6],
        ...pair(32, [
          [15, 23],
          [12, 21],
          [15, 25],
        ]),
        [10, 27, 12, 2],
        ...pair(32, [
          [10, 27],
          [7, 28],
          [10, 29],
        ]),
        [
          [15, 29],
          [16, 32],
          [17, 29],
        ],
        ...pair(32, [
          [11, 29],
          [11.5, 31],
          [13, 29],
        ]),
      ],
    ],
    [
      BLACK,
      [
        [
          [15, 12],
          [17, 12],
          [16, 17],
        ],
      ],
    ],
    [GREEN, [[13, 2, 6, 5]]],
  ],
};

const PX16 = {
  grid: 16,
  layers: [
    [
      WHITE,
      [
        [0, 5, 16, 1],
        [2, 2, 1, 3],
        [13, 2, 1, 3],
        [1, 1, 1, 1],
        [14, 1, 1, 1],
        [2, 6, 12, 1],
        [3, 7, 10, 1],
        [4, 8, 8, 1],
        [5, 9, 6, 1],
        [6, 10, 4, 1],
        [7, 11, 2, 2],
        [4, 13, 8, 1],
        [7, 14, 2, 2],
      ],
    ],
    [GREEN, [[6, 1, 4, 4]]],
  ],
};

const DRAWINGS = { 16: PX16, 32: PX32, 48: FULL, 128: FULL };

function inside(shape, x, y) {
  if (typeof shape[0] === 'number') {
    const [left, top, width, height] = shape;
    return x >= left && x < left + width && y >= top && y < top + height;
  }
  const [[ax, ay], [bx, by], [cx, cy]] = shape;
  const side = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = side(x, y, ax, ay, bx, by);
  const d2 = side(x, y, bx, by, cx, cy);
  const d3 = side(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function shade({ grid, layers }, x, y) {
  let color = BLACK;
  for (const [layerColor, shapes] of layers) {
    if (shapes.some((shape) => inside(shape, x * grid, y * grid))) color = layerColor;
  }
  return color;
}

function render(size) {
  const drawing = DRAWINGS[size];
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = shade(
            drawing,
            (px + (sx + 0.5) / SAMPLES) / size,
            (py + (sy + 0.5) / SAMPLES) / size,
          );
          sum[0] += color[0];
          sum[1] += color[1];
          sum[2] += color[2];
        }
      }
      const offset = (py * size + px) * 4;
      for (let channel = 0; channel < 3; channel++)
        pixels[offset + channel] = Math.round(sum[channel] / SAMPLES ** 2);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const size of Object.keys(DRAWINGS).map(Number)) {
  writeFileSync(`public/icons/icon${size}.png`, png(size, render(size)));
  console.log(`public/icons/icon${size}.png`);
}
