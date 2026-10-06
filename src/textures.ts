// Procedural 64x64 environment textures — Doom-style: noisy, dithered, never flat.
// Themes: WOOD, METAL, MARBLE, BRICK, HELL + a shared door TRIM + HAZARD floor.

export interface Theme {
  wall: HTMLCanvasElement[];
  floor: HTMLCanvasElement;
  ceil: HTMLCanvasElement;
  trim: HTMLCanvasElement | null;
  light: number; // base sector light 0.55..1
}

export const THEME = { WOOD: 0, METAL: 1, MARBLE: 2, BRICK: 3, HELL: 4, HAZARD_FLOOR: 5 };

function cv(w = 64, h = 64): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

// Cheap seeded value noise, 0..1.
function makeNoise(seed: number): (x: number, y: number) => number {
  const h = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263 + seed * 144665) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const s = (t: number) => t * t * (3 - 2 * t);
    const a = h(xi, yi);
    const b = h(xi + 1, yi);
    const c = h(xi, yi + 1);
    const d = h(xi + 1, yi + 1);
    return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
  };
}

function rgb(r: number, g: number, b: number): string {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function shadeHex(hex: string, f: number): string {
  const p = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return rgb(p[0] * f, p[1] * f, p[2] * f);
}

// Ordered dither: sprinkle +/- noise per pixel to break up flat fills.
function dither(g: CanvasRenderingContext2D, amount: number, seed = 7) {
  const img = g.getImageData(0, 0, 64, 64);
  const n = makeNoise(seed);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const d = (n(x * 0.9, y * 0.9) - 0.5) * 2 * amount;
      img.data[i] += d;
      img.data[i + 1] += d;
      img.data[i + 2] += d;
    }
  }
  g.putImageData(img, 0, 0);
}

// ---- WOOD ------------------------------------------------------------------
function woodWall(variant: number): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(11 + variant * 31);
  // Vertical planks, warm browns with grain streaks.
  for (let x = 0; x < 64; x++) {
    const plank = Math.floor(x / 8);
    const base = 0.82 + ((plank * 37) % 5) * 0.05;
    for (let y = 0; y < 64; y++) {
      const grain = n(x * 0.3, y * 0.08) * 0.5 + n(x * 1.7, y * 0.35) * 0.18;
      const seam = x % 8 === 0 ? 0.55 : 1;
      const f = base * (0.9 + grain * 0.5) * seam;
      g.fillStyle = rgb(0xa8 * f, 0x6e * f, 0x36 * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  // Two dark-iron straps with rivets.
  for (const sy of [14, 44]) {
    g.fillStyle = '#241d16';
    g.fillRect(0, sy, 64, 6);
    g.fillStyle = '#4a4038';
    g.fillRect(0, sy, 64, 1);
    g.fillStyle = '#0e0a08';
    for (let x = 6; x < 64; x += 16) g.fillRect(x, sy + 2, 2, 2);
  }
  if (variant === 1) {
    // Barred window — near-black with a couple of embers.
    g.fillStyle = '#0a0608';
    g.fillRect(22, 20, 20, 14);
    g.fillStyle = '#2c2620';
    for (let x = 24; x < 42; x += 5) g.fillRect(x, 20, 2, 14);
    g.fillStyle = '#a03018';
    g.fillRect(27, 28, 2, 2);
    g.fillRect(36, 24, 1, 2);
    g.fillStyle = '#171310';
    g.fillRect(21, 19, 22, 1);
    g.fillRect(21, 34, 22, 1);
  }
  dither(g, 10, 3 + variant);
  return c;
}
function woodFloor(): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(91);
  // Brown ceramic tiles, 16px grid, dark grout.
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const grout = x % 16 === 0 || y % 16 === 0;
      const chip = n(x * 0.5, y * 0.5);
      const f = grout ? 0.35 : 0.8 + chip * 0.35 - (chip > 0.86 ? 0.25 : 0);
      g.fillStyle = rgb(0x7a * f, 0x50 * f, 0x30 * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  dither(g, 8, 5);
  return c;
}
function woodCeil(): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(55);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const beam = x % 16 < 4 ? 0.45 : 1;
      const f = beam * (0.5 + n(x * 0.2, y * 0.5) * 0.25);
      g.fillStyle = rgb(0x4a * f, 0x30 * f, 0x1c * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// ---- METAL -----------------------------------------------------------------
function metalWall(variant: number): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(23 + variant * 17);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      // Gray-green panel field
      let f = 0.85 + n(x * 0.4, y * 0.4) * 0.3;
      // Panel seams at 16px
      if (x % 16 === 0 || y % 16 === 0) f = 0.5;
      if (x % 16 === 1 || y % 16 === 1) f = 1.15; // bevel highlight
      g.fillStyle = rgb(0x6a * f, 0x7a * f, 0x6c * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  // Rivet rows along seams
  g.fillStyle = '#2a3028';
  for (let x = 4; x < 64; x += 8) {
    g.fillRect(x, 2, 2, 2);
    g.fillRect(x, 62, 2, 2);
  }
  for (let y = 4; y < 64; y += 8) {
    g.fillRect(2, y, 2, 2);
    g.fillRect(62, y, 2, 2);
  }
  if (variant === 1) {
    // Vent grille
    g.fillStyle = '#10160f';
    g.fillRect(16, 20, 32, 24);
    g.fillStyle = '#3a443c';
    for (let y = 22; y < 42; y += 4) g.fillRect(17, y, 30, 2);
  } else if (variant === 2) {
    // Status light block
    g.fillStyle = '#14181c';
    g.fillRect(24, 8, 16, 10);
    g.fillStyle = '#c02020';
    g.fillRect(27, 11, 4, 4);
    g.fillStyle = '#400808';
    g.fillRect(33, 11, 4, 4);
  }
  dither(g, 9, 13 + variant);
  return c;
}
function metalFloor(): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(77);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      // Diamond tread plate
      const tread = ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0) ? 1.25 : 1;
      const f = tread * (0.55 + n(x * 0.6, y * 0.6) * 0.2);
      g.fillStyle = rgb(0x58 * f, 0x60 * f, 0x58 * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  dither(g, 8, 9);
  return c;
}
function metalCeil(): HTMLCanvasElement {
  const [c, g] = cv();
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const grid = x % 8 === 0 || y % 8 === 0 ? 0.5 : 1;
      g.fillStyle = rgb(0x30 * grid, 0x34 * grid, 0x30 * grid);
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// ---- MARBLE (green) ----------------------------------------------------------
function marbleWall(variant: number): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(41 + variant * 29);
  const v = makeNoise(97 + variant * 13);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      // Marbled veins: domain-warped noise
      const warp = v(x * 0.09, y * 0.09) * 8;
      const vein = Math.abs(Math.sin((x + warp) * 0.35 + n(x * 0.05, y * 0.05) * 6));
      const f = 0.75 + vein * 0.45;
      g.fillStyle = rgb(0x2c * f, 0x6a * f, 0x3c * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  if (variant === 1) {
    // Carved face: darker recessed blob with eye hollows
    g.fillStyle = '#12301c';
    g.fillRect(20, 16, 24, 30);
    g.fillStyle = '#0a1c10';
    g.fillRect(25, 24, 5, 6);
    g.fillRect(34, 24, 5, 6);
    g.fillRect(28, 36, 8, 3);
    g.fillStyle = '#3a6a44';
    g.fillRect(20, 16, 24, 1);
    g.fillRect(20, 16, 1, 30);
  } else if (variant === 2) {
    // Hanging vines — irregular strands from the top
    const vn = makeNoise(301);
    for (let x = 4; x < 60; x += 3) {
      const len = 8 + vn(x, 0) * 26;
      g.fillStyle = vn(x, 7) > 0.5 ? '#2a5a28' : '#1c4218';
      g.fillRect(x, 0, 1 + (vn(x, 3) > 0.7 ? 1 : 0), len);
    }
  }
  dither(g, 10, 21 + variant);
  return c;
}
function marbleFloor(): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(63);
  // 32px green/black marble checker
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const black = ((x >> 5) + (y >> 5)) % 2 === 0;
      const vein = n(x * 0.2, y * 0.2) * 0.4;
      const f = black ? 0.22 + vein : 0.8 + vein;
      g.fillStyle = black ? rgb(0x1a * f + 8, 0x30 * f + 8, 0x1c * f + 8) : rgb(0x38 * f, 0x78 * f, 0x44 * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
function marbleCeil(): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(47);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const f = 0.35 + n(x * 0.25, y * 0.25) * 0.2;
      g.fillStyle = rgb(0x1c * f + 4, 0x4a * f, 0x2c * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// ---- BRICK -------------------------------------------------------------------
function brickWall(variant: number): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(19 + variant * 23);
  const brickH = 8;
  for (let y = 0; y < 64; y++) {
    const row = Math.floor(y / brickH);
    const off = row % 2 === 0 ? 0 : 8;
    for (let x = 0; x < 64; x++) {
      const mortar = y % brickH === 0 || (x + off) % 16 === 0;
      const f = mortar ? 0.4 : 0.9 + n(x * 0.5, y * 0.5) * 0.35;
      g.fillStyle = mortar ? rgb(0x4a * f + 20, 0x42 * f + 18, 0x3a * f + 16) : rgb(0x88 * f, 0x56 * f, 0x42 * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  dither(g, 11, 17 + variant);
  return c;
}
function brickFloor(): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(83);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const seam = x % 16 === 0 || y % 16 === 0;
      const f = seam ? 0.4 : 0.6 + n(x * 0.7, y * 0.7) * 0.3;
      g.fillStyle = rgb(0x50 * f + 16, 0x44 * f + 14, 0x38 * f + 12);
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
function brickCeil(): HTMLCanvasElement {
  const [c, g] = cv();
  g.fillStyle = '#181410';
  g.fillRect(0, 0, 64, 64);
  dither(g, 12, 29);
  return c;
}

// ---- HELL ----------------------------------------------------------------------
function hellWall(variant: number): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(131 + variant * 41);
  const v = makeNoise(57);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      // Flesh-red stone with darker pulsing veins
      const vein = Math.abs(Math.sin(x * 0.28 + v(x * 0.08, y * 0.08) * 7));
      const f = 0.68 + n(x * 0.35, y * 0.35) * 0.3 + (vein > 0.85 ? -0.3 : vein * 0.25);
      g.fillStyle = rgb(0xb8 * f, 0x28 * f, 0x20 * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  if (variant === 1) {
    // Skull pile
    g.fillStyle = '#2a1410';
    g.fillRect(0, 34, 64, 30);
    for (let i = 0; i < 7; i++) {
      const x = 4 + i * 8 + ((i * 7) % 3);
      const y = 40 + ((i * 11) % 14);
      g.fillStyle = '#8a7a60';
      g.fillRect(x, y, 6, 5);
      g.fillStyle = '#100a08';
      g.fillRect(x + 1, y + 1, 1, 2);
      g.fillRect(x + 4, y + 1, 1, 2);
    }
  }
  dither(g, 12, 37 + variant);
  return c;
}
function hellFloor(): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(103);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const crack = n(x * 0.4, y * 0.4) > 0.78 ? 0.35 : 1;
      const f = crack * (0.5 + n(x * 0.9, y * 0.9) * 0.25);
      g.fillStyle = rgb(0x70 * f, 0x18 * f, 0x14 * f);
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
function hellCeil(): HTMLCanvasElement {
  const [c, g] = cv();
  g.fillStyle = '#180606';
  g.fillRect(0, 0, 64, 64);
  dither(g, 14, 43);
  return c;
}

// ---- Shared door trim + hazard floor ----------------------------------------
export function makeDoorTrim(): HTMLCanvasElement {
  const [c, g] = cv();
  g.fillStyle = '#20242a';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3c4650';
  g.fillRect(4, 0, 4, 64);
  g.fillRect(56, 0, 4, 64);
  g.fillStyle = '#565e68';
  g.fillRect(4, 0, 1, 64);
  g.fillRect(59, 0, 1, 64);
  g.fillStyle = '#14181e';
  for (let y = 6; y < 64; y += 10) {
    g.fillRect(5, y, 2, 2);
    g.fillRect(57, y, 2, 2);
  }
  dither(g, 8, 51);
  return c;
}

export function makeHazardFloor(): HTMLCanvasElement {
  const [c, g] = cv();
  const n = makeNoise(113);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      // Yellow/black diagonal diamonds (16px)
      const d = Math.floor((x + y) / 16) + Math.floor((x - y + 64) / 16);
      const yellow = d % 2 === 0;
      const f = 0.85 + n(x * 0.8, y * 0.8) * 0.25;
      g.fillStyle = yellow ? rgb(0xd8 * f, 0xa8 * f, 0x10 * f) : rgb(0x18 * f + 10, 0x18 * f + 10, 0x14 * f + 10);
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// ---- Blood pool decals --------------------------------------------------------
export function makePoolDecals(): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let v = 0; v < 3; v++) {
    const [c, g] = cv(16, 8);
    const n = makeNoise(211 + v * 17);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 16; x++) {
        const dx = (x - 8) / 8;
        const dy = (y - 4) / 4;
        const r = dx * dx + dy * dy + n(x, y) * 0.5;
        if (r < 0.9) {
          const f = 0.7 + n(x * 0.6, y * 0.6) * 0.4;
          g.fillStyle = rgb(0x60 * f, 0x08 * f, 0x08 * f);
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    out.push(c);
  }
  return out;
}

// ---- Theme table ---------------------------------------------------------------
export function makeThemes(): Theme[] {
  const trim = makeDoorTrim();
  return [
    { wall: [woodWall(0), woodWall(1)], floor: woodFloor(), ceil: woodCeil(), trim, light: 0.95 },
    { wall: [metalWall(0), metalWall(1), metalWall(2)], floor: metalFloor(), ceil: metalCeil(), trim, light: 1.0 },
    { wall: [marbleWall(0), marbleWall(1), marbleWall(2)], floor: marbleFloor(), ceil: marbleCeil(), trim, light: 0.9 },
    { wall: [brickWall(0), brickWall(1)], floor: brickFloor(), ceil: brickCeil(), trim, light: 0.9 },
    { wall: [hellWall(0), hellWall(1)], floor: hellFloor(), ceil: hellCeil(), trim, light: 0.8 },
  ];
}

// 64x64 RGBA pixels for floor/ceiling casting (cached).
const texCache = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();
export function texPixels(img: HTMLCanvasElement): Uint8ClampedArray {
  let d = texCache.get(img);
  if (!d) {
    d = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
    texCache.set(img, d);
  }
  return d;
}
