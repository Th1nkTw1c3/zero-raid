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
// 2x → 80x68px: DOOM-ish ~40% of viewport height; 3x swallowed the view.
export const VM_SCALE = 2;

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

import { paint, polish } from './painter';

// Tapered capsule between two points (width w1 at a, w2 at b).
function taper(
  g: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  w1: number, w2: number, color: string,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const l = Math.hypot(dx, dy) || 1;
  const px = (-dy / l), py = (dx / l);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(ax + px * w1 / 2, ay + py * w1 / 2);
  g.lineTo(bx + px * w2 / 2, by + py * w2 / 2);
  g.arc(bx, by, w2 / 2, Math.atan2(py, px), Math.atan2(-py, -px));
  g.lineTo(ax - px * w1 / 2, ay - py * w1 / 2);
  g.arc(ax, ay, w1 / 2, Math.atan2(-py, -px), Math.atan2(py, px));
  g.fill();
}

// ---- Pistol (painted) ---------------------------------------------------------
// Doom 2 pose: right of center, pointing up-left, gloved fist, one silhouette.
function pistolPaint(mode: 'idle' | 'fire' | 'recoil'): HTMLCanvasElement {
  return paint(80, 68, (g) => {
    const up = mode === 'fire' ? -4 : 0;
    const back = mode === 'fire' ? 4 : mode === 'recoil' ? 2 : 0;
    // Slide axis: rear (58,30) → muzzle (30,9); back = slide slides rearward.
    const rx = 58 + back * 0.8;
    const ry = 30 + back * 0.61;
    const mx = 30 + back * 0.8;
    const my = 9 + back * 0.61;
    g.save();
    g.translate(0, up);
    // Barrel nub + muzzle ring (barrel extends ahead of the slide when fired)
    taper(g, mx - 4, my - 2, mx, my, 5, 5, '#14161a');
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(mx - 4, my - 2, 2, 0, Math.PI * 2);
    g.fill();
    // Slide — dark steel capsule with a lighter top strip
    taper(g, rx, ry, mx, my, 9, 7, '#565e68');
    taper(g, rx, ry - 1.5, mx, my - 1.5, 6, 4.5, '#6a7078');
    taper(g, rx - 3, ry - 2.5, mx - 1, my - 2.5, 2.5, 2, '#b0b8c0'); // top highlight
    // ejection port notch + rear sight
    g.fillStyle = '#14161a';
    g.fillRect(rx - 14, ry - 3, 7, 3);
    g.fillRect(rx - 2, ry - 4, 3, 3);
    // Frame under the slide, merging into the grip
    taper(g, rx - 2, ry + 2, 52, 34, 7, 6, '#2a2e34');
    // Trigger guard loop + trigger
    g.strokeStyle = '#14161a';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(51, 36, 6, 4, 0.3, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#14161a';
    g.fillRect(53, 32, 2, 5);
    // Grip angled down-right
    taper(g, 55, 32, 66, 56, 11, 12, '#332718');
    taper(g, 55, 32, 65, 54, 8, 9, '#4a3a28');
    // checkered grip texture
    g.fillStyle = '#332718';
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const gx = 56 + t * 9;
      const gy = 34 + t * 20;
      g.fillRect(gx + (i % 2), gy, 2, 2);
    }
    // Fist — one connected skin blob wrapping the grip, knuckle bumps on top
    g.fillStyle = '#c89060';
    g.beginPath();
    g.ellipse(66, 44, 11, 13, -0.35, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c89060';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(57 + i * 0.5, 34 + i * 5, 3.2, 0, Math.PI * 2); // knuckles over grip front
      g.fill();
    }
    g.fillStyle = '#9a6a40';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(58, 38 + i * 6, 1.2, 0, Math.PI * 2);
      g.fill();
    }
    // thumb over the grip top
    g.fillStyle = '#c89060';
    g.beginPath();
    g.ellipse(58, 30, 4.5, 3, 0.5, 0, Math.PI * 2);
    g.fill();
    // Sleeve wedge to the bottom edge
    g.fillStyle = '#2a4a2a';
    g.beginPath();
    g.moveTo(58, 56);
    g.lineTo(80, 50);
    g.lineTo(80, 68);
    g.lineTo(56, 68);
    g.closePath();
    g.fill();
    g.fillStyle = '#1a3018';
    g.fillRect(58, 62, 22, 2);
    g.restore();
    if (mode === 'fire') {
      g.fillStyle = '#fff0a0';
      g.fillRect(mx - 8 + up * 0, my - 7 + up, 6, 4);
      g.fillRect(mx - 6, my - 10 + up, 3, 4);
      g.fillStyle = '#f0c030';
      g.fillRect(mx - 10, my - 5 + up, 2, 2);
      g.fillRect(mx - 1, my - 5 + up, 2, 2);
    }
  });
}

// ---- Shotgun (painted) --------------------------------------------------------
// Doom 2 pose: viewed from behind/above, barrel leaning up-left to the muzzle,
// walnut pump straddling it, both hands — one connected silhouette.
function shotgunPaint(mode: 'idle' | 'fire' | 'pump1' | 'pump2'): HTMLCanvasElement {
  return paint(80, 68, (g) => {
    const up = mode === 'fire' ? -5 : 0;
    const pump = mode === 'pump1' ? 7 : mode === 'pump2' ? 3.5 : 0;
    const tilt = mode === 'pump1' ? 6 : mode === 'pump2' ? 2 : 0;
    g.save();
    if (tilt) {
      g.translate(66, 68);
      g.rotate((tilt * Math.PI) / 180);
      g.translate(-66, -68);
    }
    g.translate(0, up);
    // Barrel axis: base (54,67) → muzzle (34,8). Everything overlaps it.
    const bx = 54, by = 67, mxx = 34, myy = 8;
    // Magazine tube — parallel capsule just below-right of the barrel
    taper(g, bx + 6, by - 2, mxx + 6, myy + 5, 8, 5, '#1c2026');
    taper(g, bx + 6, by - 2, mxx + 6, myy + 5, 5, 3, '#404650');
    // Barrel — one continuous tapered capsule
    taper(g, bx, by, mxx, myy, 9, 6, '#2a2e34');
    // top highlight along the upper-left edge, dark underside lower-right
    taper(g, bx - 2, by - 4, mxx - 1.5, myy, 2.2, 1.8, '#50565e');
    taper(g, bx + 3, by - 1, mxx + 3, myy + 1.5, 2.4, 2, '#16181c');
    // muzzle ring
    g.fillStyle = '#0a0c0e';
    g.beginPath();
    g.arc(mxx - 1, myy - 1, 3.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2e34';
    g.beginPath();
    g.arc(mxx - 1.4, myy - 1.6, 1.2, 0, Math.PI * 2);
    g.fill();
    // g.restore the pump offset along the barrel axis (down = toward base)
    const pdx = (bx - mxx) / 62, pdy = (by - myy) / 62;
    const pumpC = { x: mxx + (bx - mxx) * 0.45 + pdx * pump, y: myy + (by - myy) * 0.45 + pdy * pump };
    // Walnut pump block straddling the barrel — rotated capsule
    const bang = Math.atan2(myy - by, mxx - bx);
    g.save();
    g.translate(pumpC.x, pumpC.y);
    g.rotate(bang);
    g.fillStyle = '#6a4020';
    g.beginPath();
    g.roundRect(-13, -5.5, 26, 11, 4);
    g.fill();
    g.fillStyle = '#8a5a30';
    g.fillRect(-13, -5.5, 26, 3);
    g.fillStyle = '#3e2410';
    for (let i = -9; i <= 9; i += 3) g.fillRect(i, -2, 1.5, 7); // grip ridges
    // Left hand wrapped around the pump from below-left — connected to it
    g.fillStyle = '#c89060';
    g.beginPath();
    g.ellipse(-6, 8, 8, 6, 0.3, 0, Math.PI * 2);
    g.fill();
    // knuckle bumps over the pump's top edge
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(-10 + i * 4, -4, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#9a6a40';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(-8 + i * 4, -2, 1, 0, Math.PI * 2);
      g.fill();
    }
    // sleeve continues to the bottom edge
    g.fillStyle = '#2a4a2a';
    g.beginPath();
    g.moveTo(-14, 10);
    g.lineTo(2, 10);
    g.lineTo(10, 40);
    g.lineTo(-14, 40);
    g.closePath();
    g.fill();
    g.restore();
    // Receiver block under the barrel base — bottom right
    g.fillStyle = '#2a2e34';
    g.beginPath();
    g.roundRect(50, 52, 24, 16, 3);
    g.fill();
    g.fillStyle = '#4a5058';
    g.fillRect(50, 52, 24, 3);
    g.fillStyle = '#16181c';
    g.fillRect(56, 58, 10, 4); // loading port
    // Right hand + trigger finger peeking at the bottom edge
    g.fillStyle = '#c89060';
    g.beginPath();
    g.ellipse(60, 66, 9, 7, -0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9a6a40';
    g.fillRect(54, 60, 8, 2); // finger into the guard
    g.restore();
    if (mode === 'fire') {
      // flash at the muzzle (it rides up with the gun)
      g.fillStyle = '#fff0a0';
      g.fillRect(30, myy - 8 + up, 8, 4);
      g.fillRect(33, myy - 11 + up, 3, 4);
      g.fillStyle = '#f0c030';
      g.fillRect(28, myy - 6 + up, 2, 3);
      g.fillRect(39, myy - 6 + up, 2, 3);
    }
  });
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
    idle: pistolPaint('idle'),
    fire: pistolPaint('fire'),
    recoil: pistolPaint('recoil'),
  },
  shotgun: {
    idle: shotgunPaint('idle'),
    fire: shotgunPaint('fire'),
    pump1: shotgunPaint('pump1'),
    pump2: shotgunPaint('pump2'),
  },
  chainsaw: {
    idle1: polish(drawPixels(chainsawFrame(0, 0, false), SAW_PAL, VM_SCALE)),
    idle2: polish(drawPixels(chainsawFrame(1, 0, false), SAW_PAL, VM_SCALE)),
    cut: polish(drawPixels(chainsawFrame(1, 3, true), SAW_PAL, VM_SCALE)),
  },
  spell: {
    idle1: polish(drawPixels(spellFrame(0, 0, false), SPELL_PAL, VM_SCALE)),
    idle2: polish(drawPixels(spellFrame(1, 0, false), SPELL_PAL, VM_SCALE)),
    cast: polish(drawPixels(spellFrame(0, -6, true), SPELL_PAL, VM_SCALE)),
    recover: polish(drawPixels(spellFrame(1, 4, false), SPELL_PAL, VM_SCALE)),
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
