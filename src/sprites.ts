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

// Imp: the everyday unread. Small, red, angry.
const IMP_ROWS = [
  '................',
  '....K......K....',
  '....KK....KK....',
  '....KRK..KRK....',
  '.....RRRRRR.....',
  '....RRRRRRRR....',
  '...RRRYRRYRRR...',
  '...RRRRRRRRRR...',
  '..RRRRRWWRRRRR..',
  '..RRRRRRRRRRRR..',
  '..RRRRRKKRRRRR..',
  '...RRRRRRRRRR...',
  '....RRRRRRRR....',
  '.....RR..RR.....',
  '....RRR..RRR....',
  '....KK....KK....',
];

const IMP_PALETTE: Palette = {
  K: '#201010',
  R: '#8c2820',
  r: '#b04838',
  Y: '#f0d040',
  W: '#e8e0d0',
};

// Cursed demon (needs reply): bigger, violet, one big glowing eye.
const CURSED_ROWS = [
  '......KKKK......',
  '....KKVVVVKK....',
  '...KVVVVVVVVK...',
  '..KVVVWWWWVVVK..',
  '..KVWWKKKKWWVK..',
  '.KVVWKWYYKWKVVK.',
  '.KVVWKWYYKWKVVK.',
  '.KVVVWKKKWKVVVK.',
  '.KVVVVWWWWVVVVK.',
  'KVVVVVVVVVVVVVVK',
  'KVVVKKVVVVVKKVVVK',
  'KVVVKKVVVVVKKVVVK',
  '.KVVVVVVVVVVVVK.',
  '..KVVVVVVVVVVK..',
  '...KKVVVVVVKK...',
  '.....KKKKKK.....',
];

const CURSED_PALETTE: Palette = {
  K: '#140a20',
  V: '#5c2c9c',
  W: '#8c5cd0',
  Y: '#f04040',
};

// Boss: the mail that actually matters. Big horns, red eyes, bony teeth.
const BOSS_ROWS = [
  '....KK............KK....',
  '...KKKK..........KKKK...',
  '...KKKKK........KKKKK...',
  '....KKKKK......KKKKK....',
  '.....KKKKK....KKKKK.....',
  '......KKKKKKKKKKKK......',
  '.....KRRRRRRRRRRRRK.....',
  '...KRRRRRRRRRRRRRRRK...',
  '....KRRREERRRREERRRK....',
  '....KRRREERRRREERRRK....',
  '..KRRRRRRRRRRRRRRRRRK...',
  '..KRRRRRRRRRRRRRRRRRK...',
  '..KRRRRWWWWWWWWWWRRRK...',
  '..KRRRWRWRWRWRWRWRRRK...',
  '..KRRRRWWWWWWWWWWRRRK...',
  '...KRRRRRRRRRRRRRRK.....',
  '...KRRRRRRRRRRRRRRK.....',
  '..KRRRRRRRRRRRRRRRRK....',
  '..KRRRRKRRRRRRKRRRRK....',
  '..KRRRRKRRRRRRKRRRRK....',
  '..KRRRRRRRRRRRRRRRRK....',
  '...KRRRRRRRRRRRRRRK.....',
  '....KKKRRRRRRRRKKK......',
  '......KKKKKKKKKK........',
];

const BOSS_PALETTE: Palette = {
  K: '#3a0c0c',
  R: '#8c1818',
  W: '#d0c0a0',
  E: '#f04040',
  Y: '#f0e040',
};

export interface DemonFrames {
  walk: HTMLCanvasElement[];
  attack: HTMLCanvasElement;
  pain: HTMLCanvasElement;
  death: HTMLCanvasElement[];
}

// walk[1]: legs shifted so feet alternate; attack: horns/arms raised, wider mouth.
function makeFrames(
  rows: string[],
  palette: Palette,
  scale: number,
  altLegs: string[],
  attackRows: string[],
): DemonFrames {
  const walk0 = drawPixels(rows, palette, scale);
  const walk1 = drawPixels([...rows.slice(0, rows.length - 3), ...altLegs], palette, scale);
  const attack = drawPixels(attackRows, palette, scale);
  // Pain frame: everything bleached white except the eyes.
  const painPal: Palette = {};
  for (const k of Object.keys(palette)) painPal[k] = '#f0f0f0';
  if ('Y' in palette) painPal.Y = '#f04040';
  if ('E' in palette) painPal.E = '#f04040';
  const pain = drawPixels(rows, painPal, scale);
  // Death: collapse toward the floor, increasingly blood-soaked.
  const death = [0.75, 0.5, 0.25].map((f, i) => {
    const c = makeCanvas(walk0.width, walk0.height);
    const g = c.getContext('2d')!;
    const dh = walk0.height * f;
    g.drawImage(walk0, 0, walk0.height - dh, walk0.width, dh);
    g.fillStyle = `rgba(140,10,10,${0.3 + i * 0.2})`;
    g.globalCompositeOperation = 'source-atop';
    g.fillRect(0, walk0.height - dh, walk0.width, dh);
    return c;
  });
  return { walk: [walk0, walk1], attack, pain, death };
}

const IMP_ATTACK_ROWS = [
  '....K......K....',
  '....KK....KK....',
  '...KKRK..KRKK...',
  '...RRRRRRRRRR...',
  '..RRRRRRRRRRRR..',
  '..RRRYRRRRYRRR..',
  '..RRRRRRRRRRRR..',
  '.RRRRRWWWWRRRRR.',
  '.RRRRRWWWWRRRRR.',
  '..RRRRRKKRRRRR..',
  '...RRRRRRRRRR...',
  '....RRRRRRRR....',
  '.....RR..RR.....',
  '....RRR..RRR....',
  '....KK....KK....',
  '................',
];

const CURSED_ATTACK_ROWS = [
  '....KK....KK....',
  '...KKKKKKKKKK...',
  '..KKVVVVVVVVKK..',
  '.KVVVWWWWWWVVVK.',
  '.KVWWKKKKKKWWVK.',
  'KVVWKWYYYYKWKVVK',
  'KVVWKWYYYYKWKVVK',
  'KVVVWKKKKKWKVVVK',
  'KVVVVWWWWWWVVVVK',
  'KVVVVVVVVVVVVVVK',
  'KVVVKKVVVVVKKVVVK',
  'KVVVKKVVVVVKKVVVK',
  '.KVVVVVVVVVVVVK.',
  '..KVVVVVVVVVVK..',
  '...KKVVVVVVKK...',
  '.....KKKKKK.....',
];

export const demons: Record<'imp' | 'cursed' | 'boss', DemonFrames> = {
  imp: makeFrames(
    IMP_ROWS,
    IMP_PALETTE,
    2,
    ['....RR....RR....', '...RRR....RRR...', '...KK......KK...'],
    IMP_ATTACK_ROWS,
  ),
  cursed: makeFrames(
    CURSED_ROWS,
    CURSED_PALETTE,
    2,
    ['.....KKKKKK.....', '....KK....KK....', '...KK......KK...'],
    CURSED_ATTACK_ROWS,
  ),
  boss: makeFrames(
    BOSS_ROWS,
    BOSS_PALETTE,
    2,
    ['..KRRRRRRRRRRRRRRRRK....', '..KKKRRRRRRRRRRRKKK.....', '....KKK........KKK......'],
    BOSS_ROWS.map((r, i) => (i === 0 ? '...KK............KK.....' : r)),
  ),
};

export function makeBloodParticle(): HTMLCanvasElement {
  return drawPixels(['.RR.', 'RRRR', 'RRrR', '.RR.'], { R: '#b01818', r: '#701010' });
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
