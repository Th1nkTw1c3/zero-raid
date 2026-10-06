// Freedoom (BSD) art loader. Everything here is optional — if the manifest or
// any image fails, loadAssets() returns null and the game keeps its procedural
// art. Lumps live in public/freedoom/ (fetch via `npm run assets`).

import { texPixels } from './textures';

// One animation frame in 8 rotations (Doom lump rot 1..8 → index 0..7;
// index 0 = facing the viewer). `flips` marks mirrored lumps (…a2a8 style).
// `rotating` = real rotations exist; procedural frames fill all 8 with one img.
export interface RotFrame {
  imgs: HTMLCanvasElement[];
  flips: boolean[];
  rotating: boolean;
}

export interface AssetDemon {
  walk: RotFrame[];
  attack: RotFrame[];
  pain: RotFrame;
  death: RotFrame[];
  worldH: number; // png.height / 56 → SpriteDraw.scale
}

export interface ShotArt {
  fly: HTMLCanvasElement[];
  burst: HTMLCanvasElement[];
}

export interface Assets {
  demons: Record<string, AssetDemon>;
  weapons: Record<string, Record<string, HTMLCanvasElement>>;
  faces: Record<string, HTMLCanvasElement>; // 'stfst00' etc.
  puff: HTMLCanvasElement[];
  blud: HTMLCanvasElement[];
  shots: Record<string, ShotArt>;
  wallTexs: HTMLCanvasElement[][]; // per theme
  trimTexs: HTMLCanvasElement[]; // per theme door-frame trim
  floorTexs: Uint8ClampedArray[]; // theme floors + hazard last
  ceilTexs: Uint8ClampedArray[];
}

interface Manifest {
  sprites: Record<string, string[]>;
  graphics: string[];
  textures: Record<string, { walls: string[]; trim?: string | null; floor: string | null; ceil: string | null }>;
  hazard: string | null;
}

type Images = Map<string, HTMLCanvasElement>;

function toCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

// Resolve a Doom lump name to a canvas. Rot r in 1..8; for mirrored lumps
// (name..rXfY.png where the frame appears as the second pair) returns flipped.
function lumpPick(
  imgs: Images,
  lump: string,
  frame: string,
  rot: number,
): { img: HTMLCanvasElement; flip: boolean } | null {
  const direct = imgs.get(`${lump}${frame}${rot}`);
  if (direct) return { img: direct, flip: false };
  // {lump}{frame}{r} or {lump}{frame}{r}{frame}{r2}
  const re = new RegExp(`^${lump}${frame}(\\d)(?:${frame}(\\d))?$`);
  for (const [name, img] of imgs) {
    const m = name.match(re);
    if (!m) continue;
    if (Number(m[1]) === rot) return { img, flip: false };
    if (m[2] !== undefined && Number(m[2]) === rot) return { img, flip: true };
  }
  const all = imgs.get(`${lump}${frame}0`);
  if (all) return { img: all, flip: false };
  return null;
}

function rotFrame(imgs: Images, lump: string, frame: string): RotFrame {
  const out: RotFrame = { imgs: [], flips: [], rotating: false };
  let fallback: { img: HTMLCanvasElement; flip: boolean } | null = null;
  for (let r = 1; r <= 8; r++) {
    const got = lumpPick(imgs, lump, frame, r);
    if (got && !fallback) fallback = got;
    if (got && r > 1) out.rotating = true;
    out.imgs[r - 1] = got ? got.img : null!;
    out.flips[r - 1] = got ? got.flip : false;
  }
  if (!fallback) throw new Error(`missing lump ${lump}${frame}`);
  for (let r = 0; r < 8; r++) if (!out.imgs[r]) out.imgs[r] = fallback.img;
  return out;
}

// Demon specs: lump prefix + frame letters per our animation layout.
const DEMON_SPEC: Record<string, { lump: string; walk: string[]; attack: string[]; pain: string; death: string[] }> = {
  imp: { lump: 'troo', walk: ['a', 'b', 'c', 'd'], attack: ['e', 'g'], pain: 'h', death: ['i', 'j', 'k', 'l', 'm'] },
  swarmer: { lump: 'skul', walk: ['a', 'b', 'a', 'b'], attack: ['c', 'd'], pain: 'e', death: ['f', 'g', 'h', 'i', 'j'] },
  bot: { lump: 'bspi', walk: ['a', 'b', 'd', 'e'], attack: ['g', 'h'], pain: 'i', death: ['j', 'k', 'l', 'm', 'n'] },
  phantom: { lump: 'sarg', walk: ['a', 'b', 'c', 'd'], attack: ['e', 'g'], pain: 'h', death: ['i', 'j', 'k', 'l', 'm'] },
  cursed: { lump: 'boss', walk: ['a', 'b', 'c', 'd'], attack: ['e', 'g'], pain: 'h', death: ['i', 'j', 'k', 'l', 'm'] },
  boss: { lump: 'cybr', walk: ['a', 'b', 'c', 'd'], attack: ['e', 'f'], pain: 'g', death: ['h', 'i', 'j', 'k', 'l'] },
};

const THEME_NAMES = ['wood', 'metal', 'marble', 'brick', 'hell'];

async function loadImg(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export async function loadAssets(onProgress: (pct: number) => void): Promise<Assets | null> {
  try {
    const res = await fetch('freedoom/manifest.json');
    if (!res.ok) return null;
    const manifest = (await res.json()) as Manifest;

    // Collect every file to load.
    const wanted = new Set<string>();
    for (const list of Object.values(manifest.sprites)) for (const n of list) wanted.add(`sprites/${n}`);
    for (const n of manifest.graphics) wanted.add(`graphics/${n}`);
    for (const t of Object.values(manifest.textures)) {
      for (const n of t.walls) wanted.add(`patches/${n}`);
      if (t.trim) wanted.add(`patches/${t.trim}`);
      if (t.floor) wanted.add(`flats/${t.floor}`);
      if (t.ceil) wanted.add(`flats/${t.ceil}`);
    }
    if (manifest.hazard) wanted.add(`flats/${manifest.hazard}`);

    const imgs: Images = new Map();
    let done = 0;
    const total = wanted.size;
    for (const path of wanted) {
      const img = await loadImg(`freedoom/${path}`);
      const base = path.split('/')[1].replace(/\.png$/, '');
      imgs.set(base, toCanvas(img));
      onProgress(Math.round((++done / total) * 100));
    }

    const get = (n: string) => {
      const c = imgs.get(n);
      if (!c) throw new Error(`missing ${n}`);
      return c;
    };

    const demons: Assets['demons'] = {};
    for (const [kind, s] of Object.entries(DEMON_SPEC)) {
      const rf = (f: string) => rotFrame(imgs, s.lump, f);
      demons[kind] = {
        walk: s.walk.map(rf),
        attack: s.attack.map(rf),
        pain: rf(s.pain),
        death: s.death.map(rf),
        worldH: 1,
      };
      demons[kind].worldH = demons[kind].walk[0].imgs[0].height / 56;
    }

    const weapons: Assets['weapons'] = {
      pistol: {
        idle: get('pisga0'),
        fire: imgs.get('pisfa0') || get('pisgb0'),
        recoil: imgs.get('pisgc0') || get('pisgb0'),
      },
      shotgun: {
        idle: get('shtga0'),
        fire: imgs.get('shtfa0') || get('shtga0'),
        pump1: get('shtgc0'),
        pump2: imgs.get('shtgd0') || get('shtgb0'),
      },
      chainsaw: { idle1: get('sawga0'), idle2: get('sawgb0'), cut: get('sawgc0') },
    };
    if (imgs.get('shtfb0')) weapons.shotgun.fire2 = imgs.get('shtfb0')!;

    const faces: Assets['faces'] = {};
    for (const n of manifest.graphics) faces[n.replace(/\.png$/, '')] = get(n.replace(/\.png$/, ''));

    const anim = (lump: string, letters: string) =>
      [...letters].map((f) => imgs.get(`${lump}${f}0`) || imgs.get(`${lump}${f}1`)).filter(Boolean) as HTMLCanvasElement[];

    const puff = anim('puff', 'abcd');
    const blud = anim('blud', 'abc');
    const shots: Assets['shots'] = {
      imp: { fly: anim('bal1', 'ab'), burst: anim('bal1', 'cde') },
      cursed: { fly: bal7Fly(imgs, 'a'), burst: anim('bal7', 'cde') },
      bot: { fly: anim('apls', 'ab'), burst: anim('apbx', 'abcde') },
      boss: { fly: anim('misl', 'a'), burst: anim('misl', 'bcd') },
    };

    const wallTexs: HTMLCanvasElement[][] = [];
    const trimTexs: HTMLCanvasElement[] = [];
    const floorTexs: Uint8ClampedArray[] = [];
    const ceilTexs: Uint8ClampedArray[] = [];
    for (const t of THEME_NAMES) {
      const tx = manifest.textures[t];
      if (!tx || !tx.walls.length) throw new Error(`no walls for ${t}`);
      wallTexs.push(tx.walls.map((n) => get(n.replace(/\.png$/, ''))));
      trimTexs.push(tx.trim ? get(tx.trim.replace(/\.png$/, '')) : wallTexs[wallTexs.length - 1][0]);
      floorTexs.push(texPixels(get((tx.floor || tx.walls[0]).replace(/\.png$/, ''))));
      ceilTexs.push(texPixels(get((tx.ceil || tx.floor || tx.walls[0]).replace(/\.png$/, ''))));
    }
    if (manifest.hazard) floorTexs.push(texPixels(get(manifest.hazard.replace(/\.png$/, ''))));

    return { demons, weapons, faces, puff, blud, shots, wallTexs, trimTexs, floorTexs, ceilTexs };
  } catch (err) {
    console.warn('freedoom assets failed — procedural fallback:', err);
    return null;
  }
}

// bal7 fly frames are rotated lumps (a1a5 etc.) — just take rot-1 views.
function bal7Fly(imgs: Images, letter: string): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (const [name, img] of imgs) {
    const m = name.match(new RegExp(`^bal7${letter}(\\d)`));
    if (m && Number(m[1]) === 1) out.push(img);
  }
  return out.length ? out : [];
}

// Pick the canvas for a rotation index 0..7 (0 = facing viewer).
export function rotPick(rf: RotFrame, rot: number): { img: HTMLCanvasElement; flip: boolean } {
  return { img: rf.imgs[rot & 7], flip: rf.flips[rot & 7] };
}

// Wrap a procedural canvas into a non-rotating RotFrame (fallback path).
export function staticFrame(img: HTMLCanvasElement): RotFrame {
  return { imgs: Array(8).fill(img), flips: Array(8).fill(false), rotating: false };
}

// ---- status-bar face --------------------------------------------------------
// Set once assets load so hud.ts stays decoupled from the loader.
let faceImgs: Record<string, HTMLCanvasElement> | null = null;
export function setFaces(faces: Record<string, HTMLCanvasElement>) {
  faceImgs = faces;
}

// Doom STF lumps: stfst{b}{look}, stfouch{b}, stfevl{b}, stfkill{b}, stfdead0.
// Our blood level 0..3 → lump index via [0,1,3,4].
export function faceFor(state: string, lookDir: number, blood: number): HTMLCanvasElement | null {
  if (!faceImgs) return null;
  const b = [0, 1, 3, 4][Math.min(3, blood)];
  const look = Math.min(2, Math.max(0, lookDir + 1));
  const name =
    state === 'ouch'
      ? `stfouch${Math.min(4, b)}`
      : state === 'grin'
        ? `stfevl${Math.min(4, b)}`
        : state === 'glum'
          ? `stfkill${Math.min(4, b)}`
          : `stfst${b}${look}`;
  return faceImgs[name] || faceImgs[`stfst${b}1`] || null;
}
