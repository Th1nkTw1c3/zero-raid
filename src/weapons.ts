// Procedural first-person weapon viewmodels — DOOM proportions: ~120px of a
// 320px view, hands gripping every gun, art anchored to the bottom edge.
// Frames are built on 40x34 char grids at scale 3.

type Palette = Record<string, string>;

function drawPixels(rows: string[], palette: Palette, scale = 1): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  return c;
}

const W = 40;
const H = 34;

// Char-grid builder helpers.
function blank(): string[] {
  return Array.from({ length: H }, () => '.'.repeat(W));
}
function px(rows: string[], x: number, y: number, ch: string) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
}
function rect(rows: string[], x: number, y: number, w: number, h: number, ch: string) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(rows, x + i, y + j, ch);
}
function shiftUp(rows: string[], n: number): string[] {
  const out = rows.slice(n).concat(Array.from({ length: n }, () => '.'.repeat(W)));
  return out;
}
function shiftDown(rows: string[], n: number): string[] {
  return Array.from({ length: n }, () => '.'.repeat(W)).concat(rows.slice(0, H - n));
}
function shiftRight(rows: string[], n: number): string[] {
  return rows.map((r) => '.'.repeat(n) + r.slice(0, W - n));
}
// Hand: a fist of `fw` wide x `fh` tall with `fingers` darker knuckle lines.
function hand(rows: string[], x: number, y: number, w: number, h: number, fingers: number) {
  rect(rows, x, y, w, h, 'H');
  for (let f = 1; f <= fingers; f++) {
    const fy = y + Math.floor((h / (fingers + 1)) * f);
    for (let i = 0; i < w; i++) px(rows, x + i, fy, 'h');
  }
  // wrist shadow under the fist
  rect(rows, x, y + h, w, 1, 'h');
}

// ---- Pistol ----------------------------------------------------------------
// Right-of-center, slide up top, grip angled down into a gloved hand.
const PISTOL_PAL: Palette = {
  K: '#14161a',
  S: '#8a929a', // slide steel
  L: '#b0b8c0', // slide highlight
  s: '#3a3e44', // slide shadow
  F: '#2a2e34', // frame
  G: '#4a3a28', // grip light
  g: '#332718', // grip dark
  H: '#c89060', // skin
  h: '#9a6a40', // skin shadow
  V: '#2a4a2a', // sleeve
  v: '#1a3018', // sleeve shadow
  W: '#fff0a0',
  Y: '#f0c030',
};

function pistolFrame(slideBack: number, up: number, flash: boolean): string[] {
  const r = blank();
  const sx = 14 + slideBack;
  // Barrel sticking out of the slide (revealed when the slide rides back)
  rect(r, 10, 3, 4 + slideBack, 3, 'K');
  px(r, 10, 4, 's');
  // Slide: highlight row on top, steel body, dark lower edge
  rect(r, sx, 2, 14, 1, 'L');
  rect(r, sx, 3, 14, 4, 'S');
  rect(r, sx, 7, 14, 1, 's');
  // Ejection port notch + rear sight
  rect(r, sx + 9, 4, 4, 2, 's');
  rect(r, sx + 12, 1, 2, 1, 'K');
  px(r, sx, 1, 'K');
  // Frame rail below slide
  rect(r, 14, 8, 14, 2, 'F');
  rect(r, 14, 10, 10, 1, 'K');
  // Trigger guard loop + trigger
  rect(r, 16, 11, 7, 1, 'K');
  rect(r, 16, 12, 1, 3, 'K');
  rect(r, 22, 12, 1, 3, 'K');
  px(r, 20, 12, 'K');
  // Grip angled down-right, checkered
  for (let y = 10; y < 24; y++) {
    const gx = 23 + Math.floor((y - 10) / 4);
    for (let x = 0; x < 6; x++) {
      px(r, gx + x, y, (x + y) % 2 ? 'G' : 'g');
    }
  }
  // Trigger finger extended toward the guard + 3 fingers wrapping the grip
  hand(r, 29, 12, 5, 3, 0);
  rect(r, 25, 14, 9, 2, 'H'); // finger reaching to trigger
  hand(r, 28, 17, 7, 8, 3);
  px(r, 27, 13, 'h'); // thumb crease
  // Sleeve filling to the bottom edge
  rect(r, 26, 25, 14, 9, 'V');
  rect(r, 26, 25, 14, 1, 'v');
  rect(r, 26, 31, 14, 1, 'v');
  if (flash) {
    // Flash cluster above the muzzle
    rect(r, 8, 1, 3, 1, 'W');
    px(r, 9, 0, 'W');
    px(r, 7, 2, 'Y');
    px(r, 11, 2, 'Y');
    px(r, 9, 2, 'W');
  }
  return up ? shiftUp(r, up) : r;
}

// ---- Shotgun ---------------------------------------------------------------
// Centered, muzzle up: twin barrels + mag tube, walnut furniture, both hands.
const SHOT_PAL: Palette = {
  K: '#14161a',
  B: '#6a7078', // barrel steel
  b: '#404650', // barrel dark
  T: '#565c66', // mag tube
  W: '#5a3a1a', // walnut
  w: '#7a5030', // walnut highlight
  R: '#3a3f46', // receiver
  H: '#c89060',
  h: '#9a6a40',
  V: '#2a4a2a',
  v: '#1a3018',
  F: '#e06020',
  Y: '#f0c030',
  M: '#fff0a0',
};

function shotgunFrame(up: number, tilt: number, foreDown: number, flash: boolean): string[] {
  const r = blank();
  // Twin barrels + magazine tube to the top edge
  rect(r, 17, 0, 3, 14, 'B');
  rect(r, 21, 0, 3, 14, 'B');
  px(r, 18, 0, 'K');
  px(r, 22, 0, 'K');
  rect(r, 19, 0, 1, 14, 'b');
  rect(r, 23, 0, 1, 14, 'b');
  rect(r, 17, 14, 7, 4, 'T'); // mag tube cap into receiver
  // Receiver + loading port
  rect(r, 15, 17, 11, 5, 'R');
  rect(r, 18, 19, 5, 2, 'K');
  px(r, 15, 17, 'b');
  // Walnut fore-end (under the barrels — the pump)
  const fy = 8 + foreDown;
  rect(r, 15, fy, 11, 6, 'W');
  rect(r, 15, fy, 11, 1, 'w');
  for (let i = 0; i < 11; i += 2) px(r, 15 + i, fy + 3, 'w'); // grip ridges
  // Left hand wrapped on the fore-end
  hand(r, 12, fy + 1, 5, 5, 2);
  // Walnut stock down-left + right hand on the grip/trigger
  rect(r, 13, 22, 7, 10, 'W');
  rect(r, 13, 22, 7, 1, 'w');
  rect(r, 14, 30, 6, 4, 'w');
  hand(r, 24, 23, 6, 7, 2); // right fist at the wrist of the stock
  px(r, 23, 22, 'H'); // trigger finger
  // Sleeves to the bottom edge
  rect(r, 8, 30, 14, 4, 'V');
  rect(r, 26, 30, 12, 4, 'V');
  px(r, 8, 30, 'v');
  px(r, 26, 30, 'v');
  let out = r;
  if (tilt) {
    // Fake tilt: right columns sag progressively
    for (let i = 0; i < tilt; i++) {
      for (let y = 0; y < H; y++) {
        const x = 24 + i * 3 + (y > 8 ? Math.floor((y - 8) / 10) : 0);
        if (x < W) {
          // shift the slice down one pixel
          const ch = out[y][x];
          if (ch !== '.') {
            out[y] = out[y].slice(0, x) + '.' + out[y].slice(x + 1);
            px(out, x, y + 1, ch);
          }
        }
      }
    }
  }
  if (flash) {
    rect(out, 17, -2 + 1, 7, 1, 'M');
    rect(out, 18, 0, 5, 1, 'M');
    px(out, 16, 1, 'Y');
    px(out, 24, 1, 'Y');
    px(out, 20, 1, 'M');
    rect(out, 19, -1, 3, 1, 'M');
  }
  return up ? shiftUp(out, up) : out;
}

// ---- Chainsaw ---------------------------------------------------------------
// Orange-red housing bottom-right, long steel bar angling to the top-left.
const SAW_PAL: Palette = {
  K: '#14161a',
  B: '#6a7078', // bar steel
  b: '#404650',
  T: '#9aa0a8', // teeth
  O: '#c04020', // housing
  o: '#e06030', // housing highlight
  H: '#c89060',
  h: '#9a6a40',
  V: '#2a4a2a',
  v: '#1a3018',
  S: '#fff0a0', // sparks
};

function chainsawFrame(teethOff: number, up: number, sparks: boolean): string[] {
  const r = blank();
  // Blade: diagonal bar from (6,2) to (20,14)
  for (let i = 0; i < 9; i++) {
    rect(r, 6 + i, 2 + i, 5, 3, 'B');
    px(r, 6 + i, 2 + i + 1, 'b');
  }
  // Teeth nubs along both edges, alternating offset for the rev anim
  for (let i = 0; i < 9; i++) {
    if ((i + teethOff) % 2 === 0) px(r, 5 + i, 1 + i, 'T');
    if ((i + teethOff) % 2 === 1) px(r, 10 + i, 4 + i, 'T');
  }
  // Housing body
  rect(r, 16, 15, 18, 12, 'O');
  rect(r, 16, 15, 18, 2, 'o');
  rect(r, 16, 25, 18, 2, 'K');
  rect(r, 30, 18, 4, 6, 'K'); // exhaust grill
  for (let i = 0; i < 3; i++) px(r, 30 + i, 19, 'o');
  // Pull-cord loop
  rect(r, 17, 20, 1, 5, 'K');
  px(r, 18, 24, 'K');
  // Top handle + left hand gripping it
  rect(r, 18, 13, 10, 2, 'K');
  hand(r, 20, 11, 6, 4, 1);
  // Rear grip + right hand
  rect(r, 24, 27, 8, 3, 'K');
  hand(r, 26, 28, 7, 5, 2);
  // Sleeves to the bottom edge
  rect(r, 14, 30, 14, 4, 'V');
  rect(r, 28, 32, 12, 2, 'V');
  if (sparks) {
    px(r, 4, 1, 'S');
    px(r, 6, 0, 'S');
    px(r, 3, 3, 'S');
    px(r, 8, 1, 'S');
    px(r, 5, 4, 'S');
    px(r, 10, 3, 'S');
  }
  return up ? shiftUp(r, up) : r;
}

// ---- Hellfire hand -----------------------------------------------------------
// Bare clawed hand palm-up, flame rising off the palm.
const SPELL_PAL: Palette = {
  H: '#c89060',
  h: '#9a6a40',
  N: '#2a2018', // nails
  V: '#2a4a2a',
  v: '#1a3018',
  O: '#e06020',
  F: '#f0a030',
  Y: '#fff0a0',
};

function spellFrame(flame: number, handDy: number, big: boolean): string[] {
  const r = blank();
  const hy = 18 + handDy;
  // Palm
  rect(r, 15, hy + 4, 10, 4, 'H');
  rect(r, 15, hy + 7, 10, 1, 'h');
  // Spread fingers + dark nails
  const fx = [13, 16, 19, 22, 25];
  fx.forEach((x, i) => {
    const fh = i === 2 ? 5 : i === 0 || i === 4 ? 2 : 4;
    rect(r, x, hy + 4 - fh, 2, fh, 'H');
    px(r, x, hy + 4 - fh, 'N');
    px(r, x + 1, hy + 4 - fh, 'N');
  });
  // Thumb out right
  rect(r, 25, hy + 5, 3, 2, 'H');
  px(r, 27, hy + 5, 'N');
  // Wrist + sleeve to bottom edge
  rect(r, 16, hy + 8, 8, 4, 'h');
  rect(r, 14, hy + 11, 12, 34 - hy - 11, 'V');
  rect(r, 14, hy + 11, 12, 1, 'v');
  // Layered flame above the palm
  const f = big ? 1.5 : 1;
  const fy = hy - Math.round(9 * f);
  const wob = flame % 2;
  rect(r, 17, fy + Math.round(5 * f), 6, Math.round(3 * f), 'O');
  rect(r, 18 - wob, fy + Math.round(2 * f), 4, Math.round(4 * f), 'O');
  rect(r, 18 + wob, fy + Math.round(3 * f), 3, Math.round(3 * f), 'F');
  rect(r, 19, fy + Math.round(4 * f), 2, Math.round(3 * f), 'Y');
  px(r, 17 + wob, fy + Math.round(1 * f), 'O');
  px(r, 21 - wob, fy + Math.round(1 * f), 'F');
  px(r, 19, fy, 'O');
  if (big) {
    // Trailing embers while casting
    px(r, 14, fy + 3, 'F');
    px(r, 26, fy + 5, 'O');
    px(r, 13, fy + 8, 'O');
    px(r, 27, fy + 10, 'F');
  }
  return r;
}

export const weaponFrames: Record<string, Record<string, HTMLCanvasElement>> = {
  pistol: {
    idle: drawPixels(pistolFrame(0, 0, false), PISTOL_PAL, 3),
    fire: drawPixels(pistolFrame(4, 2, true), PISTOL_PAL, 3),
    recoil: drawPixels(pistolFrame(2, 0, false), PISTOL_PAL, 3),
  },
  shotgun: {
    idle: drawPixels(shotgunFrame(0, 0, 0, false), SHOT_PAL, 3),
    fire: drawPixels(shotgunFrame(4, 0, 0, true), SHOT_PAL, 3),
    pump1: drawPixels(shotgunFrame(0, 4, 5, false), SHOT_PAL, 3),
    pump2: drawPixels(shotgunFrame(0, 2, 2, false), SHOT_PAL, 3),
  },
  chainsaw: {
    idle1: drawPixels(chainsawFrame(0, 0, false), SAW_PAL, 3),
    idle2: drawPixels(chainsawFrame(1, 0, false), SAW_PAL, 3),
    cut: drawPixels(chainsawFrame(1, 3, true), SAW_PAL, 3),
  },
  spell: {
    idle1: drawPixels(spellFrame(0, 0, false), SPELL_PAL, 3),
    idle2: drawPixels(spellFrame(1, 0, false), SPELL_PAL, 3),
    cast: drawPixels(spellFrame(0, -6, true), SPELL_PAL, 3),
    recover: drawPixels(spellFrame(1, 4, false), SPELL_PAL, 3),
  },
};

export const muzzleFlashFrames: HTMLCanvasElement[] = [
  drawPixels(
    [
      '..........Y.............',
      '..........YY............',
      '..Y.......YYY.......Y...',
      '..YY....YYYYY.....YY....',
      '...YY..YYYYYYY..YY......',
      '....YYYYYYWYYYYYY.......',
      '..YYYYYYYWWWYYYYYYY.....',
      'YYYYYYYYWWWWWYYYYYYYY...',
      '..YYYYYYYWWWYYYYYYY.....',
      '....YYYYYYWYYYYYY.......',
      '...YY..YYYYYYY..YY......',
      '..YY....YYYYY.....YY....',
      '..Y.......YYY.......Y...',
      '..........YY............',
      '..........Y.............',
    ],
    { Y: '#f0c030', W: '#fff8d0' },
    2,
  ),
  drawPixels(
    [
      '.....Y...........Y......',
      '......Y.........Y.......',
      '.......Y...Y...Y........',
      '........Y.YYY.Y.........',
      '..Y....YYYYYYYY....Y....',
      '...YY.YYYWWWWWYY.YY.....',
      '....YYYYWWWWWWWYYYY.....',
      'YYYYYYWWWWWWWWWYYYYYY...',
      '....YYYYWWWWWWWYYYY.....',
      '...YY.YYYWWWWWYY.YY.....',
      '..Y....YYYYYYYY....Y....',
      '........Y.YYY.Y.........',
      '.......Y...Y...Y........',
      '......Y.........Y.......',
      '.....Y...........Y......',
    ],
    { Y: '#f0a020', W: '#fff0b0' },
    2,
  ),
];

export const casingImg: HTMLCanvasElement = drawPixels(['BB.', 'BBK'], {
  B: '#c8a040',
  K: '#6a5018',
});
