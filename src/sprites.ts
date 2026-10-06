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

// Swarmer: promo spam — small, fast, orange, all teeth.
const SWARMER_ROWS = [
  '............',
  '..K......K..',
  '..KK....KK..',
  '.KRRRRRRRRK.',
  '.RRYRRRRYRR.',
  'RRRRWWWWRRRR',
  'RRRWRWRWRRRR',
  '.RRRRRRRRR..',
  '..RRR..RRR..',
  '..RR....RR..',
  '..KR....RK..',
  '............',
];

const SWARMER_PALETTE: Palette = {
  K: '#381808',
  R: '#c05010',
  r: '#f08020',
  Y: '#f0e040',
  W: '#f0f0e0',
};

// Bot: automated updates — steel box, red eye slit, slow and armored.
const BOT_ROWS = [
  '..KKKKKKKKKKKK..',
  '.KSSSSSSSSSSSSK.',
  '.KSWWWWWWWWWSSK.',
  '.KSWKEEEEEEKWSK.',
  '.KSWWWWWWWWWSSK.',
  '.KSSSSSSSSSSSSK.',
  'KKSSSSSSSSSSSSKK',
  'KSSKSSSSSSSSKSSK',
  'KSKKSSSSSSSSKKSK',
  'KSSKSSSSSSSSKSSK',
  'KKSSSSSSSSSSSSKK',
  '.KSSSSSSSSSSSSK.',
  '.KSSKKSSSSKKSSK.',
  '.KSKK.SSSS.KKSK.',
  '.KKK..SSSS..KKK.',
  '................',
];

const BOT_PALETTE: Palette = {
  K: '#2a2e34',
  S: '#505860',
  W: '#8a929a',
  E: '#f03030',
};

// Phantom: social noise — a flickering teal ghost with a ragged hem.
const PHANTOM_ROWS = [
  '.....KKKK.....',
  '...KKTTTTKK...',
  '..KTTTTTTTTK..',
  '.KTTTWWWWTTTK.',
  '.KTTWEWWWEWTTK',
  'KTTTTWWWWTTTTK',
  'KTTTTTTTTTTTTK',
  'KTTTTKKKKTTTTK',
  'KTTKTTTTTTKTTK',
  'KTTTTTTTTTTTTK',
  'KTTTTTTTTTTTTK',
  '.KTTTTTTTTTTK.',
  '.KTTKTTTTKTTK.',
  '..KTKTTTTKTK..',
  '..KT.KTTK.TK..',
  '..K..K..K..K..',
];

const PHANTOM_PALETTE: Palette = {
  K: '#1a3a3a',
  T: '#3aa0a0',
  W: '#c0f0f0',
  E: '#0a1a1a',
};

export type EnemyKindName = 'imp' | 'swarmer' | 'bot' | 'phantom' | 'cursed' | 'boss';

export const demons: Record<EnemyKindName, DemonFrames> = {
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
  swarmer: makeFrames(
    SWARMER_ROWS,
    SWARMER_PALETTE,
    2,
    ['..RR....RR..', '.RRR....RRR.', '.KK......KK.'],
    SWARMER_ROWS.map((r, i) =>
      i === 0 ? '..K......K..' : i === 5 ? 'RRWWWWWWWWRR' : i === 6 ? 'RRWRWRWRWRRR' : r,
    ),
  ),
  bot: makeFrames(
    BOT_ROWS,
    BOT_PALETTE,
    2,
    ['.KSKK.SSSS.KKSK.', '.KKK.SSSS.KKK...', '.KK..SSSS..KK...'],
    BOT_ROWS.map((r, i) =>
      i === 3 ? '.KSWKEEEEEEKWSK.' : i === 6 ? 'KSSSSSSSSSSSSK.K' : r,
    ),
  ),
  phantom: makeFrames(
    PHANTOM_ROWS,
    PHANTOM_PALETTE,
    2,
    ['..KTKTTTTKTK..', '..KT.KTTK.TK..', '..K..K..K..K..'],
    PHANTOM_ROWS.map((r, i) =>
      i === 0 ? '...KK....KK...' : i === 8 ? 'KTTTTTTTTTTTTK' : r,
    ),
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

// Single-color blob — dust, decals, explosion sparks, phantom motes.
export function makeDot(color: string, accent?: string): HTMLCanvasElement {
  return drawPixels(['.AA.', 'AAAA', 'ABAA', '.AA.'], { A: color, B: accent || color });
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
