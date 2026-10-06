// Procedural pixel art — demons, wall/door textures. No external assets.
// Sprite frames are drawn once at init into offscreen canvases.

type Palette = Record<string, string>;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function drawPixels(rows: string[], palette: Palette, scale = 1): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = makeCanvas(w * scale, h * scale);
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

// ---- Demons ------------------------------------------------------------
// Painted at 4x, downsampled, posterized + outlined (see painter.ts).

import { paint, polish, blob, limb, spike, eye, teeth } from './painter';

export interface DemonFrames {
  walk: HTMLCanvasElement[]; // [4]
  attack: HTMLCanvasElement[]; // [2]: windup, throw/fire
  pain: HTMLCanvasElement;
  death: HTMLCanvasElement[]; // [5]: collapse → heap
}

// Pain = bleached-white recolor of walk[0].
function whiteout(img: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(img.width, img.height);
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(240,240,240,0.9)';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Death: 5 bottom-anchored collapse frames with growing blood soak.
function deathFrames(img: HTMLCanvasElement): HTMLCanvasElement[] {
  return [0.92, 0.72, 0.5, 0.3, 0.16].map((f, i) => {
    const c = makeCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    const dh = img.height * f;
    const dw = img.width * Math.min(1.3, 1 + (1 - f) * 0.5);
    g.drawImage(img, (img.width - dw) / 2, img.height - dh, dw, dh);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(140,10,10,${0.25 + i * 0.15})`;
    g.fillRect(0, img.height - dh, dw, dh);
    return c;
  });
}

const BONE = '#d0c0a0';

// ---- Imp: hunched brown demon, bone spikes, fireball hands -------------
const IMP = { base: '#6a4a2a', light: '#8a6a3a', dark: '#3a2a16' };
function impFrame(pose: 'w0' | 'w1' | 'w2' | 'w3' | 'atk0' | 'atk1'): HTMLCanvasElement {
  return paint(40, 56, (g) => {
    const P = IMP;
    const step = pose === 'w0' ? -2 : pose === 'w1' ? 2 : pose === 'w2' ? 1 : pose === 'w3' ? -1 : 0;
    // legs — digitigrade, alternate stride
    limb(g, 15, 34, 12 + step, 50, 5, P.base, P.light, P.dark);
    limb(g, 25, 34, 28 - step, 50, 5, P.base, P.light, P.dark);
    spike(g, 12 + step, 50, Math.PI / 2 + 0.4, 4, 1.5, BONE); // knee claws
    spike(g, 28 - step, 50, Math.PI / 2 - 0.4, 4, 1.5, BONE);
    // feet
    blob(g, 11 + step, 52, 4, 2.5, P.dark, P.base, '#1a100a');
    blob(g, 29 - step, 52, 4, 2.5, P.dark, P.base, '#1a100a');
    // hunched torso
    blob(g, 20, 26, 10, 10, P.base, P.light, P.dark);
    // pecs/abs lines
    g.fillStyle = P.dark;
    g.fillRect(14, 26, 12, 1);
    g.fillRect(15, 30, 10, 1);
    // long arms — swing with stride; raised on attack
    const armRaise = pose === 'atk0' ? -8 : pose === 'atk1' ? -4 : 0;
    limb(g, 11, 22, 5 - step, 38 + armRaise, 4.5, P.base, P.light, P.dark);
    limb(g, 29, 22, 35 + step, 38 + armRaise, 4.5, P.base, P.light, P.dark);
    spike(g, 11, 22, -Math.PI / 2 - 0.5, 5, 2, BONE); // shoulder spikes
    spike(g, 29, 22, -Math.PI / 2 + 0.5, 5, 2, BONE);
    spike(g, 5 - step, 36 + armRaise, 0, 4, 1.5, BONE); // elbow spikes
    spike(g, 35 + step, 36 + armRaise, Math.PI, 4, 1.5, BONE);
    // claws / fireball in hand
    if (pose === 'atk0') {
      blob(g, 35 + step, 36 + armRaise, 4, 4, '#e06010', '#f0c030', '#a03008');
      eye(g, 35 + step, 36 + armRaise, 2, '#f0a020', 0.9);
    }
    for (const [hx, hy] of [[5 - step, 38 + armRaise], [35 + step, 38 + armRaise]]) {
      spike(g, hx, hy, Math.PI / 2, 3, 1.2, '#e8e0d0');
      spike(g, hx + 1.5, hy, Math.PI / 2 + 0.4, 3, 1.2, '#e8e0d0');
    }
    // head — hunched forward, jaw open
    blob(g, 20, 12, 8, 7, P.base, P.light, P.dark);
    blob(g, 20, 15, 7, 5, P.base, P.light, P.dark); // muzzle
    g.fillStyle = '#180a06';
    g.fillRect(14, 16, 12, 4); // open mouth
    teeth(g, 14, 16, 12, 4, 6);
    teeth(g, 15, 17, 10, 3, 5, '#d8d0c0', false);
    eye(g, 15.5, 10.5, 1.4, '#f03020', 0.9);
    eye(g, 24.5, 10.5, 1.4, '#f03020', 0.9);
    // brow ridge + tiny horns
    g.fillStyle = P.dark;
    g.fillRect(13, 8, 14, 2);
    spike(g, 14, 7, -Math.PI / 2 - 0.5, 3, 1.5, BONE);
    spike(g, 26, 7, -Math.PI / 2 + 0.5, 3, 1.5, BONE);
  });
}

// ---- Swarmer: Lost Soul — flaming skull ----------------------------------
function swarmerFrame(phase: number): HTMLCanvasElement {
  return paint(28, 28, (g) => {
    const wob = Math.sin(phase * 1.7) * 1.5;
    // flame mane — animated licks
    const flames: [number, number, number][] = [
      [14, 6, 9], [8, 8, 7], [20, 8, 7], [5, 13, 6], [23, 13, 6], [9, 17, 5], [19, 17, 5],
    ];
    for (const [fx, fy, fl] of flames) {
      const l = fl + Math.sin(phase * 2.3 + fx) * 2;
      spike(g, fx + wob * 0.4, fy, -Math.PI / 2, l, 2.5, '#e06010');
      spike(g, fx + wob * 0.2, fy + 1, -Math.PI / 2, l * 0.6, 1.6, '#f0a020');
    }
    // skull
    blob(g, 14, 16, 9, 8, BONE, '#e8d8b8', '#8a7858');
    // cranium cracks
    g.fillStyle = '#6a5a40';
    g.fillRect(10, 9, 1, 3);
    g.fillRect(17, 8, 1, 4);
    // eye sockets — burning
    g.fillStyle = '#180a06';
    g.fillRect(8, 14, 5, 5);
    g.fillRect(16, 14, 5, 5);
    eye(g, 10.5, 16, 1.2, '#f04020', 0.9);
    eye(g, 18.5, 16, 1.2, '#f04020', 0.9);
    // nose hole + screaming jaw
    g.fillStyle = '#180a06';
    g.fillRect(13, 19, 2, 3);
    g.fillRect(10, 23, 8, 3);
    teeth(g, 10, 23, 8, 3, 4);
  });
}

// ---- Bot: Arachnotron — brain dome on four steel legs --------------------
const BOTP = { steel: '#4a5260', steelL: '#8a929a', steelD: '#262c34', brain: '#c08080' };
function botFrame(phase: number, mode: 'w' | 'atk' | 'die' = 'w'): HTMLCanvasElement {
  return paint(56, 44, (g) => {
    const P = BOTP;
    // four legs scissor on walk phases
    const offs = [0, 2, 0, -2];
    const s = offs[phase % 4];
    for (const side of [-1, 1]) {
      const cx = 28 + side * 12;
      const foot1 = cx + side * 16 + (side < 0 ? s : -s);
      const foot2 = cx + side * 13 - (side < 0 ? s : -s);
      limb(g, cx, 26, foot1, 40, 3.5, P.steel, P.steelL, P.steelD);
      limb(g, cx, 28, foot2, 42, 3.5, P.steel, P.steelL, P.steelD);
      spike(g, foot1, 40, Math.PI / 2, 3, 2, P.steelD);
      spike(g, foot2, 42, Math.PI / 2, 3, 2, P.steelD);
    }
    // chassis
    blob(g, 28, 24, 15, 9, P.steel, P.steelL, P.steelD);
    // underside plasma emitter
    blob(g, 28, 32, 5, 3, '#1c2a1c', '#40ff60', '#0a140a');
    if (mode === 'atk') {
      eye(g, 28, 33, 2.5, '#40ff60', 1);
      g.fillStyle = 'rgba(64,255,96,0.4)';
      g.fillRect(24, 33, 8, 3);
    }
    // brain dome
    blob(g, 28, 15, 11, 8, mode === 'die' ? '#802020' : P.brain, '#e0a8a8', '#704040');
    // vein lines
    g.strokeStyle = '#704040';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(22, 10); g.quadraticCurveTo(26, 14, 23, 18);
    g.moveTo(30, 8); g.quadraticCurveTo(34, 13, 31, 18);
    g.moveTo(35, 11); g.quadraticCurveTo(37, 15, 34, 19);
    g.stroke();
    if (mode === 'die') {
      g.fillStyle = '#401010';
      g.fillRect(20, 12, 6, 4);
      g.fillRect(31, 9, 5, 5);
    }
    // face plate + red slit
    g.fillStyle = P.steelD;
    g.fillRect(20, 19, 16, 6);
    g.fillStyle = '#f03030';
    g.fillRect(23, 21, 10, 2);
  });
}

// ---- Phantom: pink Spectre — Pinky silhouette, translucent ---------------
const SPEC = { base: '#c06080', light: '#e088a0', dark: '#803050' };
function phantomFrame(phase: number, seed: number): HTMLCanvasElement {
  return paint(48, 40, (g) => {
    const P = SPEC;
    const step = phase % 2 === 0 ? -2 : 2;
    // stubby legs
    limb(g, 20, 30, 18 + step, 38, 5, P.base, P.light, P.dark);
    limb(g, 30, 30, 32 - step, 38, 5, P.base, P.light, P.dark);
    // hunched back — hump rising to the rear
    blob(g, 26, 20, 14, 11, P.base, P.light, P.dark);
    blob(g, 34, 16, 8, 7, P.base, P.light, P.dark); // shoulder hump
    // tiny arms
    limb(g, 14, 24, 10, 30, 3, P.base, P.light, P.dark);
    limb(g, 20, 25, 17, 31, 3, P.base, P.light, P.dark);
    // big head low at the front, huge jaw
    blob(g, 14, 18, 9, 7, P.base, P.light, P.dark);
    g.fillStyle = '#200810';
    g.beginPath();
    g.ellipse(13, 21, 8, 4.5, 0.15, 0, Math.PI * 2);
    g.fill(); // gaping mouth
    teeth(g, 6, 17, 14, 4, 7);
    teeth(g, 7, 21, 12, 3.5, 6, '#d8d0c0', false);
    eye(g, 11, 13, 1.3, '#f0f0f0', 0.8);
    // back horns
    spike(g, 30, 9, -Math.PI / 2 - 0.6, 6, 2.5, BONE);
    spike(g, 37, 11, -Math.PI / 2 - 0.2, 5, 2.5, BONE);
    // ragged shimmer edge — per-phase noise sparks
    g.fillStyle = 'rgba(232,136,160,0.8)';
    for (let i = 0; i < 10; i++) {
      const a = (i * 2.7 + seed * 5 + phase) % 6.28;
      const rx = 24 + Math.cos(a) * 16;
      const ry = 20 + Math.sin(a) * 14;
      g.fillRect(rx, ry, 1, 1);
    }
  });
}

// ---- Cursed: Baron of Hell — pink torso, goat legs, plasma hands ---------
const BARON = { base: '#c05060', light: '#e07080', dark: '#702030', leg: '#5a3a20' };
function baronFrame(pose: 'w0' | 'w1' | 'w2' | 'w3' | 'atk0' | 'atk1'): HTMLCanvasElement {
  return paint(48, 64, (g) => {
    const P = BARON;
    const step = pose === 'w0' ? -2 : pose === 'w1' ? 2 : pose === 'w2' ? 1 : pose === 'w3' ? -1 : 0;
    // goat legs — digitigrade with hooves
    limb(g, 20, 40, 16 + step, 52, 6, P.leg, '#7a5030', '#301c10');
    limb(g, 28, 40, 32 - step, 52, 6, P.leg, '#7a5030', '#301c10');
    blob(g, 15 + step, 55, 4.5, 3, '#1c1008', '#301c10', '#0a0503'); // hooves
    blob(g, 33 - step, 55, 4.5, 3, '#1c1008', '#301c10', '#0a0503');
    // pink torso — wide shoulders
    blob(g, 24, 28, 13, 14, P.base, P.light, P.dark);
    g.fillStyle = P.dark;
    g.fillRect(16, 30, 16, 1);
    g.fillRect(18, 35, 12, 1);
    // arms — raised w/ plasma on attack
    const armY = pose === 'atk0' ? 14 : pose === 'atk1' ? 18 : 38;
    limb(g, 12, 24, 6, armY, 5, P.base, P.light, P.dark);
    limb(g, 36, 24, 42, armY, 5, P.base, P.light, P.dark);
    if (pose === 'atk0' || pose === 'atk1') {
      // green plasma ball
      blob(g, 6, armY - 2, 4.5, 4.5, '#1a4a1a', '#40ff60', '#0a2a0a');
      eye(g, 6, armY - 2, 2.2, '#40ff60', 1);
    } else {
      for (const hx of [5, 43]) {
        spike(g, hx, 39, Math.PI / 2, 3.5, 1.5, '#e8e0d0');
        spike(g, hx + 1, 39, Math.PI / 2 + 0.4, 3.5, 1.5, '#e8e0d0');
      }
    }
    // head — horned, mean
    blob(g, 24, 13, 9, 8, P.base, P.light, P.dark);
    // curled horns
    spike(g, 17, 9, -Math.PI * 0.75, 8, 2.5, BONE);
    spike(g, 31, 9, -Math.PI * 0.25, 8, 2.5, BONE);
    spike(g, 14, 4, -Math.PI * 0.6, 4, 2, BONE);
    spike(g, 34, 4, -Math.PI * 0.4, 4, 2, BONE);
    // green glowing eyes
    eye(g, 20, 12, 1.6, '#40ff60', 0.95);
    eye(g, 28, 12, 1.6, '#40ff60', 0.95);
    // snarling muzzle
    g.fillStyle = '#30101a';
    g.fillRect(19, 17, 10, 3);
    teeth(g, 19, 17, 10, 3, 5);
    g.fillStyle = P.dark;
    g.fillRect(21, 15, 2, 2);
    g.fillRect(25, 15, 2, 2);
  });
}

// ---- Boss: Cyberdemon-ish — rocket arm, mech leg ---------------------------
const CYBER = { base: '#8a3a28', light: '#b05540', dark: '#4a1c10', mech: '#505860' };
function bossFrame(pose: 'w0' | 'w1' | 'w2' | 'w3' | 'atk0' | 'atk1'): HTMLCanvasElement {
  return paint(72, 88, (g) => {
    const P = CYBER;
    const step = pose === 'w0' ? -3 : pose === 'w1' ? 3 : pose === 'w2' ? 1.5 : pose === 'w3' ? -1.5 : 0;
    // organic leg + mechanical leg
    limb(g, 30, 58, 26 + step, 78, 9, P.base, P.light, P.dark);
    blob(g, 24 + step, 82, 8, 4, P.dark, P.base, '#1a0c06');
    // mech leg — pistons
    g.strokeStyle = P.mech;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(44, 58);
    g.lineTo(48 - step, 74);
    g.stroke();
    g.strokeStyle = '#8a929a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(42, 60); g.lineTo(46 - step, 74);
    g.stroke();
    g.fillStyle = '#3a4048';
    g.fillRect(42 - step, 74, 12, 6);
    g.fillStyle = '#f03030';
    g.fillRect(45 - step, 76, 2, 2);
    // massive torso
    blob(g, 36, 38, 22, 20, P.base, P.light, P.dark);
    // chest wires
    g.strokeStyle = '#301008';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(24, 40); g.quadraticCurveTo(30, 48, 26, 54);
    g.moveTo(40, 38); g.quadraticCurveTo(46, 46, 42, 56);
    g.moveTo(48, 36); g.quadraticCurveTo(52, 44, 50, 52);
    g.stroke();
    g.fillStyle = '#f03030';
    g.fillRect(36, 44, 2, 2); // wire node light
    // left arm — flesh
    limb(g, 16, 30, 8, 52, 7, P.base, P.light, P.dark);
    for (const hx of [6, 10]) spike(g, hx, 53, Math.PI / 2 + 0.2, 4, 1.6, '#e8e0d0');
    // right arm — rocket launcher
    const armUp = pose === 'atk0' || pose === 'atk1';
    const rx = armUp ? 60 : 58;
    const ry = armUp ? 26 : 40;
    g.fillStyle = '#2a2e34';
    g.fillRect(52, armUp ? 20 : 34, 16, 12);
    g.fillStyle = '#4a5058';
    g.fillRect(52, armUp ? 20 : 34, 16, 3);
    limb(g, 56, 28, rx, ry + 8, 6, P.base, P.light, P.dark);
    g.fillStyle = '#101418';
    g.fillRect(64, armUp ? 22 : 36, 4, 8); // muzzle
    if (armUp) {
      // launcher flash
      blob(g, 66, armUp ? 18 : 32, 5, 4, '#e06010', '#f0d040', '#a03008');
      eye(g, 66, armUp ? 18 : 32, 2.5, '#f0a020', 1);
    }
    // head — horned skull-face
    blob(g, 36, 16, 12, 10, P.base, P.light, P.dark);
    spike(g, 26, 10, -Math.PI * 0.8, 10, 3, BONE);
    spike(g, 46, 10, -Math.PI * 0.2, 10, 3, BONE);
    eye(g, 31, 14, 2.2, '#f03020', 1);
    eye(g, 41, 14, 2.2, '#f03020', 1);
    g.fillStyle = '#200a08';
    g.fillRect(30, 20, 12, 4);
    teeth(g, 30, 20, 12, 4, 6);
  });
}

// --------------------------------------------------------------------------
type PoseKind = 'imp' | 'swarmer' | 'bot' | 'phantom' | 'cursed' | 'boss';

function painted(kind: PoseKind): DemonFrames {
  const W = [0, 1, 2, 3];
  let walk: HTMLCanvasElement[];
  let attack: HTMLCanvasElement[];
  let base: HTMLCanvasElement;
  if (kind === 'imp') {
    walk = W.map((i) => impFrame(`w${i}` as 'w0'));
    attack = [impFrame('atk0'), impFrame('atk1')];
    base = walk[0];
  } else if (kind === 'swarmer') {
    walk = W.map(swarmerFrame);
    attack = [swarmerFrame(4), swarmerFrame(5)];
    base = walk[0];
  } else if (kind === 'bot') {
    walk = W.map((i) => botFrame(i));
    attack = [botFrame(0, 'atk'), botFrame(1, 'atk')];
    base = walk[0];
  } else if (kind === 'phantom') {
    walk = W.map((i) => phantomFrame(i, 1));
    attack = [phantomFrame(4, 2), phantomFrame(5, 3)];
    base = walk[0];
  } else if (kind === 'cursed') {
    walk = W.map((i) => baronFrame(`w${i}` as 'w0'));
    attack = [baronFrame('atk0'), baronFrame('atk1')];
    base = walk[0];
  } else {
    walk = W.map((i) => bossFrame(`w${i}` as 'w0'));
    attack = [bossFrame('atk0'), bossFrame('atk1')];
    base = walk[0];
  }
  return { walk, attack, pain: whiteout(base), death: deathFrames(base) };
}

export type EnemyKindName = 'imp' | 'swarmer' | 'bot' | 'phantom' | 'cursed' | 'boss';

export const demons: Record<EnemyKindName, DemonFrames> = {
  imp: painted('imp'),
  swarmer: painted('swarmer'),
  bot: painted('bot'),
  phantom: painted('phantom'),
  cursed: painted('cursed'),
  boss: painted('boss'),
};

export { polish };

export function makeBloodParticle(): HTMLCanvasElement {
  return drawPixels(['.RR.', 'RRRR', 'RRrR', '.RR.'], { R: '#b01818', r: '#701010' });
}

// Single-color blob — dust, decals, explosion sparks, phantom motes.
export function makeDot(color: string, accent?: string): HTMLCanvasElement {
  return drawPixels(['.AA.', 'AAAA', 'ABAA', '.AA.'], { A: color, B: accent || color });
}

// Glowing projectile ball — built-in halo so it reads additively.
export function makeGlowBall(core: string, glow: string): HTMLCanvasElement {
  const c = makeCanvas(16, 16);
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, '#fff8d8');
  grad.addColorStop(0.25, core);
  grad.addColorStop(0.6, glow);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 16);
  return c;
}

// Boss rocket — stubby red shell with a dark nozzle.
export function makeRocket(): HTMLCanvasElement {
  const c = makeCanvas(10, 6);
  const g = c.getContext('2d')!;
  g.fillStyle = '#a02818';
  g.fillRect(1, 1, 7, 4);
  g.fillStyle = '#d85030';
  g.fillRect(1, 1, 7, 1);
  g.fillStyle = '#f0d040';
  g.fillRect(8, 2, 2, 2);
  g.fillStyle = '#262c34';
  g.fillRect(0, 1, 1, 4);
  return c;
}

export function makeFireball(): HTMLCanvasElement {
  return drawPixels(
    ['..YY..', '.YOOY.', 'YOYYOY', 'YOYYOY', '.YOOY.', '..YY..'],
    { Y: '#f0c030', O: '#e06010' },
  );
}

export const sprites = {
  imp: demons.imp.walk[0],
  cursed: demons.cursed.walk[0],
};

// ---- Textures ----------------------------------------------------------

export function makeWallTexture(): HTMLCanvasElement {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d')!;
  // Dark stone bricks with mortar lines.
  g.fillStyle = '#3a3230';
  g.fillRect(0, 0, 64, 64);
  const brickH = 8;
  for (let row = 0; row < 8; row++) {
    const y = row * brickH;
    const offset = row % 2 === 0 ? 0 : 8;
    for (let x = -1; x < 5; x++) {
      const bx = x * 16 + offset;
      const shade = 0x4a + ((row * 7 + x * 13) % 3) * 0x08;
      g.fillStyle = `rgb(${shade},${shade - 10},${shade - 14})`;
      g.fillRect(bx + 1, y + 1, 14, brickH - 2);
    }
  }
  // Grime
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 40; i++) {
    g.fillRect((i * 37) % 64, (i * 53) % 64, 2, 2);
  }
  return c;
}

export function makeDoorTexture(): HTMLCanvasElement {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d')!;
  g.fillStyle = '#1a2a1a';
  g.fillRect(0, 0, 64, 64);
  // Steel door panels
  g.fillStyle = '#2a4432';
  g.fillRect(6, 4, 52, 56);
  g.fillStyle = '#1e3226';
  g.fillRect(10, 8, 44, 48);
  // Center seam + warning stripes
  g.fillStyle = '#0e1a12';
  g.fillRect(30, 8, 4, 48);
  g.fillStyle = '#c0a030';
  for (let i = 0; i < 6; i++) {
    g.fillRect(12, 40 + i * 2, 18, 1);
    g.fillRect(34, 40 + i * 2, 18, 1);
  }
  // Green exit glyph
  g.fillStyle = '#40e060';
  g.font = 'bold 12px monospace';
  g.textAlign = 'center';
  g.fillText('EXIT', 32, 26);
  return c;
}

// Interior sliding door — riveted twin-panel steel with a hazard skirt.
export function makeInnerDoorTexture(): HTMLCanvasElement {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d')!;
  // Two panel halves with a dark center slide-gap.
  g.fillStyle = '#3a4048';
  g.fillRect(0, 0, 30, 64);
  g.fillStyle = '#2a3038';
  g.fillRect(34, 0, 30, 64);
  g.fillStyle = '#101418';
  g.fillRect(30, 0, 4, 64);
  // Panel bevels
  g.fillStyle = '#4a525c';
  g.fillRect(2, 2, 26, 1);
  g.fillRect(2, 2, 1, 60);
  g.fillRect(36, 2, 26, 1);
  g.fillRect(36, 2, 1, 60);
  g.fillStyle = '#1c2026';
  g.fillRect(2, 61, 26, 1);
  g.fillRect(27, 2, 1, 60);
  g.fillRect(36, 61, 26, 1);
  g.fillRect(61, 2, 1, 60);
  // Mid-seam
  g.fillStyle = '#1c2026';
  g.fillRect(0, 31, 64, 2);
  // Rivets
  g.fillStyle = '#808890';
  for (const [rx, ry] of [
    [5, 5], [24, 5], [5, 28], [24, 28],
    [39, 5], [58, 5], [39, 28], [58, 28],
    [5, 42], [24, 42], [39, 42], [58, 42],
  ]) {
    g.fillRect(rx, ry, 2, 2);
  }
  // Hazard skirt — diagonal stripes on the bottom 8 rows.
  for (let y = 56; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      g.fillStyle = ((x + y - 56) >> 2) % 2 ? '#c0a030' : '#202020';
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

export function makeFloorTexture(): HTMLCanvasElement {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d')!;
  g.fillStyle = '#2c2c30';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#222226';
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  return c;
}
