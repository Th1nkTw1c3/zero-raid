import {
  render,
  pickTarget,
  pickTargetAt,
  castRay,
  hasLineOfSight,
  VIEW_W,
  VIEW_H,
  type Scene,
  type SceneGeom,
  type SpriteDraw,
} from './engine';
import { makeLevel, isSolid, cellAt, roomAt, type LevelMap } from './map';
import {
  demons,
  makeBloodParticle,
  makeDot,
  makeFireball,
  makeGlowBall,
  makeRocket,
  makeDoorTexture,
  makeInnerDoorTexture,
} from './sprites';
import { makeThemes, makePoolDecals, makeHazardFloor, texPixels } from './textures';
import { weaponFrames, muzzleFlashFrames, casingImg, VM_SCALE } from './weapons';
import {
  drawHud,
  drawWeapon,
  drawCenterText,
  drawAutomap,
  HUD_BAR_H,
  WEAPON_META,
  type Weapon,
  type VmDraw,
} from './hud';
import { loadAssets, rotPick, setFaces, type Assets } from './assets';
import { placeThings, THING_DEFS, type Thing } from './things';
import { sfx, loadSounds } from './sfx';
import { api } from './net';
import { showReplyOverlay } from './ui';
import type { RoomData, UnreadMsg, RaidAction, StatusResponse } from './types';

// ---------------------------------------------------------------- setup ---
const canvas = document.createElement('canvas');
canvas.width = VIEW_W;
canvas.height = VIEW_H + HUD_BAR_H;
const app = document.getElementById('app')!;
app.innerHTML = '';
app.appendChild(canvas);
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / canvas.height);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ---------------------------------------------------------------- state ---
type Screen = 'boot' | 'title' | 'play' | 'reply' | 'trans' | 'win' | 'dead' | 'tally';

type EnemyKind = 'imp' | 'swarmer' | 'bot' | 'phantom' | 'cursed' | 'boss';
type EnemyState = 'chase' | 'windup' | 'attack' | 'pain' | 'ranged';

interface Enemy {
  msg: UnreadMsg;
  kind: EnemyKind;
  state: EnemyState;
  roomId: number;
  x: number;
  y: number;
  cursed: boolean;
  hp: number;
  maxHp: number;
  dying: number;
  dead: boolean;
  glow: number;
  bob: number;
  stateT: number;
  animT: number;
  frame: number;
  flipX: boolean;
  facing: number; // radians — sprite rotation source (Doom lump rotations)
  lastX: number;
  lastY: number;
  strafeDir: 1 | -1;
  strafeT: number;
  growlT: number;
  blinkT: number;
  sawT: number;
  corpse: boolean;
  shotCd: number; // ranged cooldown
  burst: number; // bot burst counter
  frozen?: boolean; // debug: render only, no AI
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  img: HTMLCanvasElement;
  grav: number;
  frames?: HTMLCanvasElement[]; // animated by life progress (puffs, bursts)
}

interface Casing {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Projectile {
  x: number;
  y: number;
  z: number;
  target: Enemy;
  img: HTMLCanvasElement;
}

// Enemy-thrown fireball/bolt/rocket — straight-line, dodgeable.
interface Shot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  img: HTMLCanvasElement;
  trail: HTMLCanvasElement;
  smoke: boolean;
  burst?: HTMLCanvasElement[]; // freedoom explosion frames on impact
}

interface LevelStats {
  kills: number;
  replies: number;
  stars: number;
  time: number;
}

const G = {
  screen: 'boot' as Screen,
  status: null as StatusResponse | null,
  rooms: [] as RoomData[],
  demo: false,
  level: 0,
  map: null as LevelMap | null,
  exitOpen: false,
  doorState: new Map<number, { open: number; target: 0 | 1 }>(),
  roomBatches: new Map<number, UnreadMsg[]>(),
  roomSpawned: new Set<number>(),
  roomCleared: new Set<number>(),
  roomVisited: new Set<number>(),
  currentRoom: -1,
  px: 0,
  py: 0,
  dir: -Math.PI / 2,
  enemies: [] as Enemy[],
  pending: [] as UnreadMsg[],
  particles: [] as Particle[],
  casings: [] as Casing[],
  projectile: null as Projectile | null,
  shots: [] as Shot[],
  castLock: false,
  weapon: 'pistol' as Weapon,
  fireT: 0,
  vmSeq: [] as string[], // pending viewmodel stage names
  vmT: 0,
  vmKick: 0,
  vmBobT: 0,
  switchT: 0, // >0 lowering, <0 raising
  switchTo: null as Weapon | null,
  mouseDown: false,
  streak: 0,
  score: 0,
  actions: [] as number[],
  hurtT: 0,
  hitmarkT: 0,
  hitmarkShield: false,
  light: 0,
  pitch: 0,
  shakeT: 0,
  mapHeld: false,
  banners: [] as {
    text: string;
    color: string;
    until: number;
    slot: 'level' | 'room' | 'boss' | 'hint' | 'misc';
  }[],
  hintShown: false as boolean,
  transT: 0,
  cleared: new Set<number>(),
  busy: 0,
  keys: new Set<string>(),
  mouseDx: 0,
  levelStats: { kills: 0, replies: 0, stars: 0, time: 0 } as LevelStats,
  levelT0: 0,
  bestStreak: 0,
  decals: [] as { x: number; y: number; img: HTMLCanvasElement; size: number; alpha: number }[],
  roomLight: new Float32Array(0),
  flickV: [] as number[],
  flickT: [] as number[],
  fps: 60,
  face: { state: 'look' as 'look' | 'ouch' | 'grin', until: 0, lookDir: 0, lookT: 0, deadT: 0 },
  msg: '',
  assets: null as Assets | null,
  assetsLoaded: false,
  loadPct: 0,
  sfxLoaded: false,
  debugNoSprites: false, // test hook: render scene without any sprites
  things: [] as Thing[],
  thingSolid: null as Uint8Array | null,
  lightRooms: new Set<number>(),
  lookPitch: 0,
};

const THEMES = makeThemes();
const hazardFloorImg = makeHazardFloor();
let floorTexs = [...THEMES.map((t) => texPixels(t.floor)), texPixels(hazardFloorImg)];
let ceilTexs = THEMES.map((t) => texPixels(t.ceil));
let wallTexs = THEMES.map((t) => t.wall);
let trimTexs = THEMES.map((t) => t.trim ?? t.wall[0]);
const poolImgs = makePoolDecals();
const doorTex = makeDoorTexture();
const innerDoorTex = makeInnerDoorTexture();
let bloodImg = makeBloodParticle();
const dustImg = makeDot('#a0a0a0');
const holeImg = makeDot('#101010');
const sparkImg = makeDot('#f08020', '#f0c030');
const tealImg = makeDot('#3aa0a0', '#c0f0f0');
const fireballImg = makeFireball();
const smokeImg = makeDot('#808080', '#505050');
// Enemy projectiles: img, speed, size, trail particle.
const SHOT_DEF: Record<
  string,
  {
    img: HTMLCanvasElement;
    speed: number;
    size: number;
    trail: HTMLCanvasElement;
    smoke: boolean;
    cdMin: number;
    cdMax: number;
    burst?: HTMLCanvasElement[];
  }
> = {
  imp: { img: makeGlowBall('#f0c030', '#e06010'), speed: 5.5, size: 0.18, trail: sparkImg, smoke: false, cdMin: 3, cdMax: 5 },
  cursed: { img: makeGlowBall('#40ff60', '#1a6a20'), speed: 6.5, size: 0.2, trail: tealImg, smoke: false, cdMin: 2.5, cdMax: 4 },
  bot: { img: makeGlowBall('#60ff80', '#20a040'), speed: 8, size: 0.12, trail: tealImg, smoke: false, cdMin: 4, cdMax: 4 },
  boss: { img: makeRocket(), speed: 5, size: 0.24, trail: smokeImg, smoke: true, cdMin: 2.5, cdMax: 2.5 },
};

// Active weapon viewmodels — Freedoom frames when assets load, else procedural.
let activeWeapons: Record<string, Record<string, HTMLCanvasElement>> = weaponFrames;

const SCORE: Record<RaidAction | 'reply', number> = {
  archive: 10,
  trash: 12,
  star: 25,
  reply: 40,
};

// Per-kind movement flavor. speed/strafe are multipliers on the base.
const KIND: Record<
  EnemyKind,
  { speed: number; strafeAmp: number; strafeMin: number; strafeMax: number; windup: number; scale: number; hp: number }
> = {
  imp: { speed: 1, strafeAmp: 0.5, strafeMin: 0.8, strafeMax: 1.4, windup: 0.45, scale: 0.9, hp: 1 },
  swarmer: { speed: 1.7, strafeAmp: 0.9, strafeMin: 0.3, strafeMax: 0.6, windup: 0.25, scale: 0.5, hp: 1 },
  bot: { speed: 0.7, strafeAmp: 0, strafeMin: 99, strafeMax: 99, windup: 0.6, scale: 0.85, hp: 2 },
  phantom: { speed: 1, strafeAmp: 0.5, strafeMin: 0.8, strafeMax: 1.4, windup: 0.45, scale: 0.75, hp: 1 },
  cursed: { speed: 1, strafeAmp: 0.5, strafeMin: 0.8, strafeMax: 1.4, windup: 0.45, scale: 1.15, hp: 1 },
  boss: { speed: 0.45, strafeAmp: 0.5, strafeMin: 0.8, strafeMax: 1.4, windup: 0.6, scale: 1.6, hp: 1 },
};

// Kind roll for plain mail by level (deterministic per message id).
function rollKind(msg: UnreadMsg, level: number): EnemyKind {
  if (msg.boss) return 'boss';
  if (msg.needsReply) return 'cursed';
  let h = 0;
  for (let i = 0; i < msg.id.length; i++) h = (h * 31 + msg.id.charCodeAt(i)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  h = h >>> 0;
  const r = (h % 100) / 100;
  if (level <= 0) return 'imp';
  if (level === 1) return r < 0.7 ? 'swarmer' : 'imp';
  if (level === 2) return r < 0.6 ? 'bot' : r < 0.85 ? 'swarmer' : 'imp';
  return r < 0.6 ? 'phantom' : r < 0.85 ? 'bot' : 'imp';
}

// ---------------------------------------------------------------- boot ----
async function boot() {
  try {
    const assets = await loadAssets((pct) => (G.loadPct = pct));
    if (assets) applyAssets(assets);
    if (assets) void loadSounds().then((ok) => (G.sfxLoaded = ok)); // non-blocking
    G.status = await api.status();
    G.demo = G.status.demo;
    if (G.status.connected) {
      const data = await api.rooms();
      G.rooms = data.rooms;
      G.demo = data.demo;
    }
    G.screen = 'title';
    if (G.status.connected && new URLSearchParams(location.search).has('auto')) {
      loadLevel(0);
      G.screen = 'play';
    }
  } catch (err) {
    G.msg = err instanceof Error ? err.message : String(err);
    G.screen = 'title';
  }
}

// Swap procedural art for Freedoom lumps once everything decoded.
function applyAssets(a: Assets) {
  G.assets = a;
  G.assetsLoaded = true;
  wallTexs = a.wallTexs;
  trimTexs = a.trimTexs;
  floorTexs = a.floorTexs.length > THEMES.length
    ? a.floorTexs
    : [...a.floorTexs, texPixels(hazardFloorImg)];
  ceilTexs = a.ceilTexs;
  for (const kind of Object.keys(SHOT_DEF)) {
    const art = a.shots[kind];
    if (art?.fly.length) SHOT_DEF[kind].img = art.fly[0];
    if (art?.burst.length) SHOT_DEF[kind].burst = art.burst;
  }
  if (a.blud.length) bloodImg = a.blud[0];
  Object.assign(activeWeapons, a.weapons);
  setFaces(a.faces);
}

type BannerSlot = 'level' | 'room' | 'boss' | 'hint' | 'misc';

function banner(text: string, color = '#f0d040', secs = 2.2, slot: BannerSlot = 'misc') {
  G.banners = G.banners.filter((b) => b.slot !== slot);
  G.banners.push({ text, color, until: performance.now() / 1000 + secs, slot });
}

// ------------------------------------------------------------ level load --
function solid(x: number, y: number): boolean {
  if (isSolid(G.map!, x, y, doorOpen, G.exitOpen)) return true;
  const cx = Math.floor(x), cy = Math.floor(y);
  const m = G.map!;
  if (G.thingSolid && cx >= 0 && cy >= 0 && cx < m.w && cy < m.h && G.thingSolid[cy * m.w + cx]) return true;
  return false;
}
function doorOpen(id: number): number {
  return G.doorState.get(id)?.open ?? 0;
}
function geom(): SceneGeom {
  return { map: G.map!, exitOpen: G.exitOpen, doorOpen };
}

function setDoor(id: number, target: 0 | 1) {
  const st = G.doorState.get(id);
  if (!st || st.target === target) return;
  st.target = target;
  if (target === 1 && st.open < 0.8) sfx.doorSlide();
}

function loadLevel(i: number) {
  G.level = i;
  const room = G.rooms[i];
  G.map = makeLevel(i, i * 7919 + 13, room.unread.length);
  G.px = G.map.spawn.x;
  G.py = G.map.spawn.y;
  G.dir = -Math.PI / 2;
  G.enemies = [];
  G.particles = [];
  G.casings = [];
  G.shots = [];
  G.projectile = null;
  G.castLock = false;
  G.exitOpen = false;
  G.shakeT = 0;
  G.light = 0;
  G.pitch = 0;
  G.levelStats = { kills: 0, replies: 0, stars: 0, time: 0 };
  G.levelT0 = performance.now() / 1000;
  G.roomSpawned = new Set();
  G.roomCleared = new Set();
  G.roomVisited = new Set();
  G.decals = [];
  G.roomLight = new Float32Array(G.map.rooms.length);
  G.flickV = new Array(G.map.rooms.length).fill(1);
  G.flickT = G.map.rooms.map((r) => (r.flicker ? 0.08 + Math.random() * 0.17 : 0));

  // Decorations — Freedoom lumps when assets loaded, empty otherwise.
  G.things = G.assets
    ? placeThings(G.map, new Set(Object.keys(G.assets.things)), i, G.px, G.py)
    : [];
  G.thingSolid = new Uint8Array(G.map.w * G.map.h);
  for (const t of G.things) {
    if (t.def.solid) G.thingSolid[Math.floor(t.y) * G.map.w + Math.floor(t.x)] = 1;
  }
  G.lightRooms = new Set(G.things.filter((t) => t.def.light).map((t) => t.roomId));

  const unread = [...room.unread].sort((a, b) => Number(a.boss) - Number(b.boss));
  const bossMsg = unread.find((m) => m.boss) || null;
  const fodder = unread.filter((m) => !m.boss);

  // Distribute fodder round-robin across rooms, nearest first; boss last.
  const targets = G.map.rooms.filter((r) => !r.isSpawn).sort((a, b) => a.dist - b.dist);
  G.roomBatches = new Map(targets.map((r) => [r.id, [] as UnreadMsg[]]));
  fodder.forEach((m, j) => G.roomBatches.get(targets[j % targets.length].id)!.push(m));
  if (bossMsg) {
    const boss = G.map.rooms.find((r) => r.isBoss)!;
    if (!G.roomBatches.has(boss.id)) G.roomBatches.set(boss.id, []);
    G.roomBatches.get(boss.id)!.push(bossMsg);
  }
  G.pending = unread;

  // Doors sealed, except the ones touching the (empty) spawn room.
  G.doorState = new Map(G.map.doors.map((d) => [d.id, { open: 0, target: 0 as 0 | 1 }]));
  const spawnRoom = G.map.rooms.find((r) => r.isSpawn)!;
  for (const id of spawnRoom.doors) {
    G.doorState.get(id)!.open = 1;
    G.doorState.get(id)!.target = 1;
  }
  G.currentRoom = spawnRoom.id;
  G.roomVisited.add(spawnRoom.id);

  G.hintShown = false;
  banner(`LEVEL ${i + 1}: ${room.name} — ${unread.length} UNREAD`, '#e06030', 3, 'level');
  if (bossMsg && !G.hintShown) {
    G.hintShown = true;
    banner('something important waits at the end…', '#908880', 3.5, 'hint');
  }
  if (unread.length === 0) {
    G.exitOpen = true;
    banner('ALREADY CLEAN — HEAD FOR THE EXIT', '#40e060', 3, 'room');
  }
}

function aliveCount(): number {
  return G.enemies.filter((e) => !e.dead && e.dying === 0).length;
}

function spawnEnemy(msg: UnreadMsg, room: { id: number; cells: { x: number; y: number }[] }) {
  const free = room.cells.filter(
    (c) =>
      cellAt(G.map!, c.x + 0.5, c.y + 0.5) === '.' &&
      Math.hypot(c.x + 0.5 - G.px, c.y + 0.5 - G.py) > 2.5 &&
      !G.enemies.some((e) => !e.dead && Math.hypot(e.x - c.x - 0.5, e.y - c.y - 0.5) < 1),
  );
  if (!free.length) return false;
  const c = free[Math.floor(Math.random() * free.length)];
  const kind = rollKind(msg, G.level);
  const k = KIND[kind];
  G.enemies.push({
    msg,
    kind,
    state: 'chase',
    roomId: room.id,
    x: c.x + 0.5,
    y: c.y + 0.5,
    cursed: msg.needsReply,
    hp: k.hp,
    maxHp: k.hp,
    dying: 0,
    dead: false,
    glow: 0,
    bob: Math.random() * Math.PI * 2,
    stateT: 0,
    animT: 0,
    frame: 0,
    flipX: false,
    facing: Math.random() * Math.PI * 2,
    lastX: c.x + 0.5,
    lastY: c.y + 0.5,
    strafeDir: Math.random() < 0.5 ? 1 : -1,
    strafeT: k.strafeMin + Math.random() * (k.strafeMax - k.strafeMin),
    growlT: 1 + Math.random() * 2,
    blinkT: 2 + Math.random() * 1.5,
    sawT: 0,
    corpse: false,
    shotCd: 1 + Math.random() * 2,
    burst: 0,
  });
  const pi = G.pending.findIndex((m) => m.id === msg.id);
  if (pi >= 0) G.pending.splice(pi, 1);
  return true;
}

function spawnP(
  x: number,
  y: number,
  z: number,
  img: HTMLCanvasElement,
  n: number,
  opts: { speed?: number; vzMin?: number; vzMax?: number; life?: number; size?: number; grav?: number; frames?: HTMLCanvasElement[] },
) {
  for (let i = 0; i < n; i++) {
    const sp = opts.speed ?? 1.5;
    const life = opts.life ?? 0.7;
    G.particles.push({
      x,
      y,
      z,
      vx: (Math.random() * 2 - 1) * sp,
      vy: (Math.random() * 2 - 1) * sp,
      vz: (opts.vzMin ?? 1) + Math.random() * ((opts.vzMax ?? 2) - (opts.vzMin ?? 1)),
      life,
      maxLife: life,
      size: opts.size ?? 0.08,
      img,
      grav: opts.grav ?? 4,
      frames: opts.frames,
    });
  }
}

function spawnBlood(e: Enemy, n: number) {
  // Freedoom blood lumps: a random BLUD frame per particle.
  if (G.assets?.blud.length) {
    for (let i = 0; i < n; i++) {
      spawnP(e.x, e.y, 0.5, G.assets.blud[i % G.assets.blud.length], 1, {});
    }
    return;
  }
  spawnP(e.x, e.y, 0.5, bloodImg, n, {});
}

// A demon hurls a fireball at the player's current position — dodgeable.
function fireShot(e: Enemy) {
  const def = SHOT_DEF[e.kind];
  if (!def) return;
  const dx = G.px - e.x;
  const dy = G.py - e.y;
  const d = Math.hypot(dx, dy) || 1;
  G.shots.push({
    x: e.x + (dx / d) * 0.4,
    y: e.y + (dy / d) * 0.4,
    z: 0.55,
    vx: (dx / d) * def.speed,
    vy: (dy / d) * def.speed,
    life: 3,
    size: def.size,
    img: def.img,
    trail: def.trail,
    smoke: def.smoke,
    burst: def.burst,
  });
  sfx.fireball(Math.hypot(e.x - G.px, e.y - G.py));
}

// Hitscan against decoration things (mainly barrels) in an angular cone.
function pickThing(
  scene: Scene,
  angle: number,
  maxAngle: number,
  maxDist: number,
): { thing: Thing; dist: number } | null {
  let best: { thing: Thing; dist: number } | null = null;
  for (const t of G.things) {
    if (t.dead || !t.def.explosive) continue;
    const dx = t.x - scene.px;
    const dy = t.y - scene.py;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist || dist < 0.2) continue;
    const ang = Math.atan2(dy, dx) - angle;
    const wrapped = Math.atan2(Math.sin(ang), Math.cos(ang));
    if (Math.abs(wrapped) > maxAngle + t.def.radius / Math.max(0.3, dist)) continue;
    if (!hasLineOfSight(G.map!, scene.px, scene.py, t.x, t.y, geom())) continue;
    if (!best || dist < best.dist) best = { thing: t, dist };
  }
  return best;
}

// A barrel goes up: BEXP burst, light + shake, splash-kills fodder, chains.
function explode(t: Thing) {
  t.dead = true;
  const m = G.map!;
  G.thingSolid![Math.floor(t.y) * m.w + Math.floor(t.x)] = 0;
  const bexp = G.assets?.things.bexp;
  if (bexp?.length) {
    spawnP(t.x, t.y, 0.4, bexp[0], 1, {
      speed: 0, life: 0.45, size: 0.9, grav: 0, vzMin: 0, vzMax: 0, frames: bexp,
    });
  }
  spawnP(t.x, t.y, 0.5, sparkImg, 12, { speed: 2, life: 0.5, size: 0.08 });
  sfx.barrel();
  G.light = Math.max(G.light, 1.4);
  G.shakeT = Math.max(G.shakeT, 0.25);
  const now = performance.now() / 1000;
  for (const e of G.enemies) {
    if (e.dead || e.dying > 0) continue;
    if (Math.hypot(e.x - t.x, e.y - t.y) > 1.6) continue;
    if (e.cursed || e.kind === 'boss') {
      e.state = 'pain';
      e.stateT = 0.4;
    } else {
      doAction(e, 'archive');
    }
  }
  for (const o of G.things) {
    if (o !== t && !o.dead && o.def.explosive && !o.boomAt && Math.hypot(o.x - t.x, o.y - t.y) <= 1.6) {
      o.boomAt = now + 0.15;
    }
  }
}

function hitThing(t: Thing) {
  if (t.def.explosive) explode(t);
  else spawnP(t.x, t.y, 0.5, dustImg, 3, { speed: 0.5, life: 0.3, size: 0.05 });
}

function shotCooldown(e: Enemy) {
  const def = SHOT_DEF[e.kind];
  if (!def) return;
  e.shotCd = def.cdMin + Math.random() * (def.cdMax - def.cdMin);
}

// --------------------------------------------------------------- actions --
function doAction(enemy: Enemy, action: RaidAction, gib = false) {
  enemy.dying = 0.0001;
  const boss = enemy.kind === 'boss';
  if (boss) {
    sfx.bossDie();
    G.shakeT = 0.4;
    spawnBlood(enemy, 30);
  } else if (gib) {
    // Chunky gibs for point-blank shotgun kills.
    sfx.demonDie(enemy.kind, Math.hypot(enemy.x - G.px, enemy.y - G.py));
    spawnP(enemy.x, enemy.y, 0.5, bloodImg, 6, { speed: 2.2, size: 0.12, life: 0.8 });
  } else {
    sfx.demonDie(enemy.kind, Math.hypot(enemy.x - G.px, enemy.y - G.py));
    spawnBlood(enemy, 10);
  }
  G.face.state = 'grin';
  G.face.until = performance.now() / 1000 + 0.8;
  G.face.deadT = 0;
  G.streak++;
  G.bestStreak = Math.max(G.bestStreak, G.streak);
  G.score += boss && action === 'star' ? 50 : SCORE[action];
  G.levelStats.kills++;
  if (action === 'star') G.levelStats.stars++;
  G.actions.push(Date.now());
  api
    .modify(enemy.msg.id, action)
    .then(() => {
      const unread = G.rooms[G.level].unread;
      const i = unread.findIndex((m) => m.id === enemy.msg.id);
      if (i >= 0) unread.splice(i, 1);
    })
    .catch((err) => {
      enemy.dying = 0;
      G.streak = 0;
      banner(`FAILED: ${String(err).slice(0, 40)}`, '#f04030', 3);
    });
}

async function castSpell(enemy: Enemy) {
  G.screen = 'reply';
  document.exitPointerLock?.();
  const body = await showReplyOverlay(enemy.msg, G.demo);
  G.screen = 'play';
  if (body === null) {
    banner('SPELL SHEATHED', '#908880', 1.5);
    return;
  }
  G.busy++;
  enemy.dying = 0.0001;
  const boss = enemy.kind === 'boss';
  if (boss) {
    sfx.bossDie();
    G.shakeT = 0.4;
    spawnBlood(enemy, 30);
  } else {
    sfx.explosion();
    spawnBlood(enemy, 10);
  }
  G.streak++;
  G.bestStreak = Math.max(G.bestStreak, G.streak);
  G.score += boss ? 100 : SCORE.reply;
  G.levelStats.replies++;
  G.actions.push(Date.now());
  api
    .reply(enemy.msg, body)
    .then(() => {
      const unread = G.rooms[G.level].unread;
      const i = unread.findIndex((m) => m.id === enemy.msg.id);
      if (i >= 0) unread.splice(i, 1);
      banner(G.demo ? 'REPLY SIMULATED — DEMON BANISHED' : 'REPLY SENT — DEMON BANISHED', '#c090ff');
    })
    .catch((err) => {
      enemy.dying = 0;
      G.streak = 0;
      banner(`SEND FAILED: ${String(err).slice(0, 40)}`, '#f04030', 3);
    })
    .finally(() => G.busy--);
}

// A mundane shot bounces off a shielded demon — it recoils in pain.
function shieldBounce(e: Enemy) {
  e.state = 'pain';
  e.stateT = 0.35;
  const dx = e.x - G.px;
  const dy = e.y - G.py;
  const d = Math.hypot(dx, dy) || 1;
  const nx = e.x + (dx / d) * 0.4;
  const ny = e.y + (dy / d) * 0.4;
  if (!solid(nx, e.y)) e.x = nx;
  if (!solid(e.x, ny)) e.y = ny;
  G.hitmarkT = 0.12;
  G.hitmarkShield = true;
  banner(
    e.kind === 'boss'
      ? 'THE BOSS DEMANDS AN ANSWER — [4] REPLY OR [3] STAR'
      : 'REPLY REQUIRED — HELLFIRE [4] OR CHAINSAW-STAR [3]',
    e.kind === 'boss' ? '#f04040' : '#c090ff',
  );
}

// Pain knockback for armored bots taking a non-lethal hit.
function botPain(e: Enemy, power: number) {
  e.state = 'pain';
  e.stateT = 0.3;
  const dx = e.x - G.px;
  const dy = e.y - G.py;
  const d = Math.hypot(dx, dy) || 1;
  const nx = e.x + (dx / d) * power;
  const ny = e.y + (dy / d) * power;
  if (!solid(nx, e.y)) e.x = nx;
  if (!solid(e.x, ny)) e.y = ny;
}

// Bullet hits a live enemy (non-shield). Returns true if the shot connected.
function bulletHits(e: Enemy, action: RaidAction, dmg: number): boolean {
  if (e.cursed) {
    e.glow = 1;
    sfx.shieldPing();
    shieldBounce(e);
    return true;
  }
  G.hitmarkT = 0.12;
  G.hitmarkShield = false;
  if (e.hp > dmg) {
    e.hp -= dmg;
    sfx.clank();
    botPain(e, 0.25);
    return true;
  }
  doAction(e, action);
  return true;
}

function wallImpact(hx: number, hy: number, rdx: number, rdy: number) {
  // Pull the impact point a hair back toward the shooter.
  spawnP(hx - rdx * 0.05, hy - rdy * 0.05, 0.5, dustImg, 5, {
    speed: 0.6,
    life: 0.3,
    size: 0.05,
    vzMin: 0.2,
    vzMax: 0.8,
    frames: G.assets?.puff,
  });
  G.particles.push({
    x: hx - rdx * 0.05,
    y: hy - rdy * 0.05,
    z: 0.5,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 4,
    maxLife: 4,
    size: 0.04,
    img: holeImg,
    grav: 0,
  });
}

function ejectCasing() {
  G.casings.push({
    x: VIEW_W / 2 + 14,
    y: VIEW_H - 40,
    vx: 60 + Math.random() * 30,
    vy: -90 - Math.random() * 30,
  });
}

// Viewmodel stage durations (seconds); `weapon:stage` overrides the default.
const VM_SEQ_DUR: Record<string, number> = {
  fire: 0.08,
  'shotgun:fire': 0.12,
  'shotgun:recoil': 0.22,
  'pistol:recoil': 0.08,
  pump1: 0.18,
  pump2: 0.18,
  cast: 0.2,
  recover: 0.15,
};

function vmStageDur(stage: string): number {
  return VM_SEQ_DUR[`${G.weapon}:${stage}`] ?? VM_SEQ_DUR[stage] ?? 0.05;
}

function startVmSeq(seq: string[]) {
  G.vmSeq = [...seq];
  G.vmT = vmStageDur(G.vmSeq[0]);
  if (G.vmSeq[0] === 'pump1') sfx.pump1();
  if (G.vmSeq[0] === 'pump2') sfx.pump2();
}

function fire() {
  if (G.fireT > 0 || !G.map || G.castLock || G.switchT !== 0) return;
  const scene = sceneObj();
  switch (G.weapon) {
    case 'pistol': {
      G.fireT = 0.35;
      startVmSeq(['fire', 'recoil']);
      sfx.pistol();
      G.light = 1;
      G.pitch += 3;
      G.vmKick += 10;
      ejectCasing();
      const ang = G.dir + (Math.random() - 0.5) * 0.016;
      const rdx = Math.cos(ang);
      const rdy = Math.sin(ang);
      const wall = castRay(geom(), G.px, G.py, rdx, rdy);
      const t = pickTargetAt(scene, ang, 0.045, Math.min(14, wall.dist + 0.01));
      const th = pickThing(scene, ang, 0.03, Math.min(14, wall.dist));
      if (th && (!t || th.dist < t.dist)) {
        hitThing(th.thing);
      } else if (t && t.dist < wall.dist) {
        bulletHits(G.enemies[t.idx], 'archive', 1);
      } else {
        wallImpact(wall.hx, wall.hy, rdx, rdy);
      }
      break;
    }
    case 'shotgun': {
      G.fireT = 0.8;
      startVmSeq(['fire', 'recoil', 'pump1', 'pump2']);
      sfx.shotgun();
      G.light = 1.3;
      G.pitch += 7;
      G.vmKick += 22;
      const pellets = [-0.11, -0.07, -0.035, 0, 0.035, 0.07, 0.11];
      const hits = new Map<number, number>();
      for (const off of pellets) {
        const ang = G.dir + off + (Math.random() - 0.5) * 0.03;
        const rdx = Math.cos(ang);
        const rdy = Math.sin(ang);
        const wall = castRay(geom(), G.px, G.py, rdx, rdy);
        const t = pickTargetAt(scene, ang, 0.02, Math.min(7, wall.dist + 0.01));
        const th = pickThing(scene, ang, 0.015, Math.min(7, wall.dist));
        if (th && (!t || th.dist < t.dist)) {
          hitThing(th.thing);
        } else if (t && t.dist < wall.dist) {
          hits.set(t.idx, (hits.get(t.idx) || 0) + 1);
        } else {
          spawnP(wall.hx - rdx * 0.05, wall.hy - rdy * 0.05, 0.5, dustImg, 2, {
            speed: 0.5,
            life: 0.3,
            size: 0.05,
            vzMin: 0.2,
            vzMax: 0.8,
            frames: G.assets?.puff,
          });
        }
      }
      for (const [idx, n] of hits) {
        const e = G.enemies[idx];
        if (e.cursed) {
          e.glow = 1;
          sfx.shieldPing();
          shieldBounce(e);
        } else if (n >= 2) {
          G.hitmarkT = 0.12;
          G.hitmarkShield = false;
          const dd = Math.hypot(e.x - G.px, e.y - G.py);
          doAction(e, 'trash', dd < 2.5);
        } else {
          bulletHits(e, 'trash', 1);
        }
      }
      break;
    }
    case 'spell': {
      const t = pickTarget(scene, 0.12, 11);
      if (!t) {
        banner('NO DEMON IN SIGHT', '#908880', 1.2);
        return;
      }
      const e = G.enemies[t.idx];
      G.castLock = true;
      startVmSeq(['cast', 'recover']);
      sfx.spellCast();
      G.projectile = { x: G.px, y: G.py, z: 0.5, target: e, img: fireballImg };
      break;
    }
    case 'chainsaw':
      break; // hold-to-saw in update
  }
}

// ---------------------------------------------------------------- update --
function update(dt: number, now: number) {
  G.banners = G.banners.filter((b) => b.until > now);
  G.actions = G.actions.filter((t) => Date.now() - t < 60_000);
  G.fireT = Math.max(0, G.fireT - dt);
  G.hurtT = Math.max(0, G.hurtT - dt * 2);
  G.hitmarkT = Math.max(0, G.hitmarkT - dt);
  G.light = Math.max(0, G.light - dt * (G.light > 1 ? 6 : 10));
  G.pitch += (0 - G.pitch) * Math.min(1, dt * 20);
  G.vmKick = Math.max(0, G.vmKick - dt * 12);
  G.shakeT = Math.max(0, G.shakeT - dt);

  // Viewmodel sequence + weapon switching.
  if (G.vmSeq.length) {
    G.vmT -= dt;
    if (G.vmT <= 0) {
      G.vmSeq.shift();
      if (G.vmSeq.length) {
        G.vmT = vmStageDur(G.vmSeq[0]);
        if (G.vmSeq[0] === 'pump1') sfx.pump1();
        if (G.vmSeq[0] === 'pump2') sfx.pump2();
      }
    }
  }
  if (G.switchT > 0) {
    G.switchT -= dt;
    if (G.switchT <= 0 && G.switchTo) {
      G.weapon = G.switchTo;
      G.switchTo = null;
      G.switchT = -0.12;
    }
  } else if (G.switchT < 0) {
    G.switchT = Math.min(0, G.switchT + dt);
  }

  // Screen-space casings.
  for (const c of G.casings) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vy += 400 * dt;
  }
  G.casings = G.casings.filter((c) => c.y < VIEW_H + 10);

  // Door slabs slide.
  for (const st of G.doorState.values()) {
    if (st.open < st.target) st.open = Math.min(st.target, st.open + dt * 2);
    else if (st.open > st.target) st.open = Math.max(st.target, st.open - dt * 2);
  }

  // Sector lighting: base theme light + jitter, with flicker rooms blinking.
  if (G.map) {
    G.map.rooms.forEach((r, i) => {
      let l = THEMES[r.theme].light + r.lightJ + (G.lightRooms.has(r.id) ? 0.15 : 0);
      if (r.flicker) {
        G.flickT[i] -= dt;
        if (G.flickT[i] <= 0) {
          G.flickT[i] = 0.08 + Math.random() * 0.17;
          G.flickV[i] = 0.55 + Math.random() * 0.45;
        }
        l *= G.flickV[i];
      }
      G.roomLight[i] = l;
    });
  }

  // Status-bar face: timed states, wandering eyes, glum when cold.
  {
    const f = G.face;
    f.lookT -= dt;
    if (f.lookT <= 0) {
      f.lookT = 0.8 + Math.random() * 1.2;
      f.lookDir = Math.floor(Math.random() * 3) - 1;
    }
    if (now > f.until) f.state = 'look';
    if (G.streak > 0) f.deadT = 0;
    else if (f.deadT === 0) f.deadT = now;
  }

  if (G.screen !== 'play' || !G.map) return;

  // Turning — mouse (pointer lock) + arrow fallback.
  const TURN = 2.6;
  G.dir += G.mouseDx * 0.0026;
  G.mouseDx = 0;
  if (G.keys.has('ArrowLeft')) G.dir -= TURN * dt;
  if (G.keys.has('ArrowRight')) G.dir += TURN * dt;
  G.dir = Math.atan2(Math.sin(G.dir), Math.cos(G.dir));

  // Movement
  const SPEED = 2.6;
  let mx = 0;
  let my = 0;
  const fwdX = Math.cos(G.dir);
  const fwdY = Math.sin(G.dir);
  const strX = -fwdY;
  const strY = fwdX;
  if (G.keys.has('w') || G.keys.has('ArrowUp')) {
    mx += fwdX;
    my += fwdY;
  }
  if (G.keys.has('s') || G.keys.has('ArrowDown')) {
    mx -= fwdX;
    my -= fwdY;
  }
  if (G.keys.has('a')) {
    mx -= strX;
    my -= strY;
  }
  if (G.keys.has('d')) {
    mx += strX;
    my += strY;
  }
  const moving = (mx || my) !== 0;
  if (moving) {
    const len = Math.hypot(mx, my);
    const nx = G.px + (mx / len) * SPEED * dt;
    const ny = G.py + (my / len) * SPEED * dt;
    const R = 0.22;
    if (!solid(nx + Math.sign(nx - G.px) * R, G.py)) G.px = nx;
    if (!solid(G.px, ny + Math.sign(ny - G.py) * R)) G.py = ny;
  }
  G.vmBobT += dt * (moving ? 9 : 2);

  // Stepped into the exit?
  if (G.exitOpen && cellAt(G.map, G.px, G.py) === 'D') {
    G.levelStats.time = performance.now() / 1000 - G.levelT0;
    G.screen = 'tally';
    document.exitPointerLock?.();
    return;
  }

  // Entered a new room → spring its batch.
  const room = roomAt(G.map, G.px, G.py);
  if (room && room.id !== G.currentRoom) {
    G.currentRoom = room.id;
    G.roomVisited.add(room.id);
    const batch = G.roomBatches.get(room.id) || [];
    if (!G.roomSpawned.has(room.id)) {
      G.roomSpawned.add(room.id);
      if (batch.length) {
        const hasBoss = batch.some((m) => m.boss);
        if (hasBoss) sfx.bossRoar();
        else sfx.alert();
        for (const msg of batch) spawnEnemy(msg, room);
        const boss = batch.find((m) => m.boss);
        if (boss) banner(`BOSS: ${boss.subject}`, '#f04040', 3.5, 'boss');
      }
    }
  }

  // Room clears: a spawned room with nothing left alive opens all its doors.
  // Rooms with no mail clear the moment you enter them.
  for (const r of G.map.rooms) {
    const id = r.id;
    if (r.isSpawn || G.roomCleared.has(id) || !G.roomSpawned.has(id)) continue;
    if (G.enemies.some((e) => e.roomId === id && !e.dead && e.dying === 0)) continue;
    G.roomCleared.add(id);
    for (const d of r.doors) setDoor(d, 1);
    const hadMail = (G.roomBatches.get(id) || []).length > 0;
    if (r.isBoss) {
      G.exitOpen = true;
      banner('THE EXIT GRINDS OPEN', '#40e060', 3, 'room');
      sfx.door();
    } else if (hadMail) {
      banner('ROOM CLEARED', '#40e060', 1.5, 'room');
    }
  }

  // Hellfire projectile in flight.
  if (G.projectile) {
    const p = G.projectile;
    const e = p.target;
    if (e.dead || e.dying > 0) {
      G.projectile = null;
      G.castLock = false;
    } else {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = 9 * dt;
      spawnP(p.x, p.y, p.z, sparkImg, 1, { speed: 0.3, life: 0.3, size: 0.06, vzMin: 0, vzMax: 0.3, grav: 0 });
      if (d < 0.45 || d < step) {
        G.projectile = null;
        spawnP(e.x, e.y, 0.5, sparkImg, 16, { speed: 2, life: 0.5, size: 0.1 });
        spawnP(e.x, e.y, 0.5, dustImg, 8, { speed: 1, life: 0.5, size: 0.1 });
        G.light = 1;
        G.shakeT = 0.3;
        sfx.explosion();
        e.state = 'pain';
        e.stateT = 0.35;
        G.castLock = false;
        void castSpell(e);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
  }

  // Enemy projectiles — straight shots you can sidestep.
  for (const sh of G.shots) {
    sh.life -= dt;
    const nx = sh.x + sh.vx * dt;
    const ny = sh.y + sh.vy * dt;
    spawnP(sh.x, sh.y, sh.z, sh.trail, 1, {
      speed: 0.2,
      life: sh.smoke ? 0.6 : 0.25,
      size: sh.smoke ? 0.08 : 0.05,
      vzMin: 0,
      vzMax: 0.2,
      grav: 0,
    });
    if (solid(nx, ny)) {
      // wall impact — burst animation + hiss
      if (sh.burst) {
        spawnP(sh.x, sh.y, sh.z, sh.burst[0], 1, { speed: 0, life: 0.3, size: 0.5, grav: 0, vzMin: 0, vzMax: 0, frames: sh.burst });
      }
      spawnP(sh.x, sh.y, sh.z, sparkImg, 6, { speed: 1, life: 0.3, size: 0.06 });
      sfx.hiss(Math.hypot(sh.x - G.px, sh.y - G.py));
      sh.life = 0;
      continue;
    }
    sh.x = nx;
    sh.y = ny;
    if (Math.hypot(sh.x - G.px, sh.y - G.py) < 0.4) {
      // player hit — same pain as a melee strike
      if (sh.burst) {
        spawnP(sh.x, sh.y, sh.z, sh.burst[0], 1, { speed: 0, life: 0.3, size: 0.5, grav: 0, vzMin: 0, vzMax: 0, frames: sh.burst });
      }
      spawnP(sh.x, sh.y, sh.z, sparkImg, 10, { speed: 1.5, life: 0.4, size: 0.08 });
      if (G.streak > 0) banner('STREAK BROKEN', '#f04030', 1.5);
      G.streak = 0;
      G.hurtT = 0.5;
      G.face.state = 'ouch';
      G.face.until = now / 1000 + 0.6;
      sfx.hurt();
      sh.life = 0;
    }
  }
  G.shots = G.shots.filter((sh) => sh.life > 0);

  // Chained barrel explosions.
  for (const t of G.things) {
    if (t.boomAt && now / 1000 >= t.boomAt) {
      t.boomAt = 0;
      explode(t);
    }
  }

  // Particles — ballistic bits.
  for (const p of G.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vz -= p.grav * dt;
    if (p.z < 0) {
      p.z = 0;
      p.vz = 0;
    }
  }
  G.particles = G.particles.filter((p) => p.life > 0);

  // Enemy AI state machine.
  const baseSpeed = 0.55 + G.level * 0.12;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.glow = Math.max(0, e.glow - dt * 3);
    if (e.dying > 0) {
      e.dying += dt / 0.6;
      if (e.dying >= 1 && !e.corpse) {
        // Become a floor corpse — stays rendered, no collision, untargetable.
        e.corpse = true;
        e.dying = 1;
        // Blood pool decal where it fell.
        G.decals.push({
          x: e.x,
          y: e.y,
          img: poolImgs[Math.floor(Math.random() * poolImgs.length)],
          size: 0.55 + Math.random() * 0.3,
          alpha: 0.85,
        });
        const corpses = G.enemies.filter((o) => o.corpse);
        if (corpses.length > 40) corpses[0].dead = true; // drop oldest
      }
      continue;
    }
    if (e.frozen) continue; // debug staging — rendered but no AI
    const k = KIND[e.kind];
    const dx = G.px - e.x;
    const dy = G.py - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const moveSpeed = baseSpeed * k.speed;
    e.stateT -= dt;

    // Phantom blink — sidesteps perpendicular to your line of fire.
    if (e.kind === 'phantom') {
      e.blinkT -= dt;
      if (e.blinkT <= 0 && dist > 2) {
        e.blinkT = 2 + Math.random() * 1.5;
        const px = (-dy / dist) * 1.5;
        const py = (dx / dist) * 1.5;
        for (const s of [1, -1]) {
          const nx = e.x + px * s;
          const ny = e.y + py * s;
          if (!solid(nx, ny)) {
            spawnP(e.x, e.y, 0.5, tealImg, 6, { speed: 0.8, life: 0.4, size: 0.06 });
            e.x = nx;
            e.y = ny;
            spawnP(nx, ny, 0.5, tealImg, 6, { speed: 0.8, life: 0.4, size: 0.06 });
            sfx.blink();
            break;
          }
        }
      }
    }

    if (e.state === 'chase') {
      e.strafeT -= dt;
      if (e.strafeT <= 0) {
        e.strafeDir = (e.strafeDir * -1) as 1 | -1;
        e.strafeT = k.strafeMin + Math.random() * (k.strafeMax - k.strafeMin);
      }
      let vx = dx / dist + (-dy / dist) * e.strafeDir * k.strafeAmp;
      let vy = dy / dist + (dx / dist) * e.strafeDir * k.strafeAmp;
      for (const o of G.enemies) {
        if (o === e || o.dead || o.dying > 0) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const od = Math.hypot(ox, oy);
        if (od < 0.6 && od > 0.001) {
          vx += (ox / od) * 0.8;
          vy += (oy / od) * 0.8;
        }
      }
      const vl = Math.hypot(vx, vy) || 1;
      const nx = e.x + (vx / vl) * moveSpeed * dt;
      const ny = e.y + (vy / vl) * moveSpeed * dt;
      if (!solid(nx, e.y)) e.x = nx;
      if (!solid(e.x, ny)) e.y = ny;
      e.growlT -= dt;
      if (e.growlT <= 0) {
        e.growlT = 2.5 + Math.random() * 1.5;
        if (dist < 7) sfx.growl(e.kind, dist);
      }
      // Ranged demons hurl projectiles when you keep your distance.
      e.shotCd -= dt;
      if (
        e.shotCd <= 0 &&
        SHOT_DEF[e.kind] &&
        dist >= 3 &&
        dist <= 10 &&
        hasLineOfSight(G.map!, e.x, e.y, G.px, G.py, geom())
      ) {
        e.state = 'ranged';
        e.stateT = 0.5;
      } else if (dist < 1.0) {
        e.state = 'windup';
        e.stateT = k.windup;
      }
    } else if (e.state === 'ranged') {
      if (e.stateT <= 0) {
        fireShot(e);
        if (e.kind === 'bot' && e.burst < 2) {
          e.burst++;
          e.stateT = 0.15; // 3-shot burst
        } else {
          e.burst = 0;
          shotCooldown(e);
          e.state = 'chase';
        }
      }
    } else if (e.state === 'windup') {
      if (e.stateT <= 0) {
        e.state = 'attack';
        e.stateT = 0.9;
        if (dist < 1.3) {
          if (G.streak > 0) banner('STREAK BROKEN', '#f04030', 1.5);
          G.streak = 0;
          G.hurtT = 0.5;
          G.face.state = 'ouch';
          G.face.until = now / 1000 + 0.6;
          sfx.hurt();
          const nx = e.x + (dx / dist) * 0.3;
          const ny = e.y + (dy / dist) * 0.3;
          if (!solid(nx, e.y)) e.x = nx;
          if (!solid(e.x, ny)) e.y = ny;
        }
      }
    } else if (e.state === 'attack' || e.state === 'pain') {
      if (e.stateT <= 0) e.state = 'chase';
    }

    if (e.state === 'chase') {
      e.animT += dt * moveSpeed * 4;
      e.frame = Math.floor(e.animT) % 4;
    }
    const ddx = e.x - e.lastX;
    const ddy = e.y - e.lastY;
    if (Math.abs(ddx) > 1e-4) e.flipX = ddx < 0;
    // Facing: velocity while chasing, toward the player otherwise.
    if (e.state === 'chase') {
      if (Math.hypot(ddx, ddy) > 1e-4) e.facing = Math.atan2(ddy, ddx);
    } else {
      // windup/attack/ranged/pain — squared up to the player
      e.facing = Math.atan2(G.py - e.y, G.px - e.x);
    }
    e.lastX = e.x;
    e.lastY = e.y;
  }
  G.enemies = G.enemies.filter((e) => !e.dead);

  // Chainsaw hold — rips through anything, even armored and shielded.
  if (G.weapon === 'chainsaw' && G.mouseDown) {
    sfx.chainsawStart();
    const t = pickTarget(sceneObj(), 0.25, 1.8);
    if (t) {
      const e = G.enemies[t.idx];
      sfx.chainsawRev(true);
      e.sawT += dt;
      spawnBlood(e, 2);
      sfx.sawHit();
      G.shakeT = Math.max(G.shakeT, 0.05);
      if (e.sawT > 0.55) {
        e.sawT = -999;
        doAction(e, 'star');
      }
    } else {
      sfx.chainsawRev(false);
    }
  } else {
    sfx.chainsawStop();
    for (const e of G.enemies) e.sawT = Math.max(0, e.sawT - dt * 2);
  }
}

function nextLevel() {
  if (G.level + 1 >= G.rooms.length) {
    G.screen = 'win';
    document.exitPointerLock?.();
    return;
  }
  G.screen = 'trans';
  G.transT = 0;
  document.exitPointerLock?.();
  loadLevel(G.level + 1);
  G.screen = 'play';
}

function switchWeapon(w: Weapon) {
  if (w === G.weapon || G.switchT !== 0) return;
  if (w !== 'chainsaw') sfx.chainsawStop();
  G.switchTo = w;
  G.switchT = 0.12;
  if (w === 'spell') G.mouseDown = false;
}

// ---------------------------------------------------------------- render --
function sceneObj(): Scene {
  return {
    map: G.map!,
    px: G.px,
    py: G.py,
    dir: G.dir,
    exitOpen: G.exitOpen,
    doorOpen,
    wallTexs,
    trimTexs,
    doorTex,
    doorTexs: G.assets ? G.assets.doorTexs : [0, 1, 2, 3, 4].map(() => innerDoorTex),
    floorTexs,
    ceilTexs,
    roomLight: G.roomLight,
    decals: G.decals,
    time: performance.now() / 1000,
    light: G.light,
    pitch: G.pitch + G.lookPitch,
    deathTint: !G.assetsLoaded,
    sprites: G.debugNoSprites ? [] : G.enemies.map((e, ei): SpriteDraw => {
      const f = G.assets ? G.assets.demons[e.kind] : demons[e.kind];
      let rf = f.walk[e.frame % f.walk.length];
      let yOff = 0;
      if (e.dying > 0) {
        const di = Math.min(4, Math.floor(e.dying * 5));
        rf = f.death[di];
        yOff = di * 0.04;
      } else if (e.state === 'pain') {
        rf = f.pain;
      } else if (e.state === 'windup') {
        rf = f.attack[0];
      } else if (e.state === 'attack' || e.state === 'ranged') {
        rf = f.attack[1];
      }
      // Doom lump rotation: index 0 faces the viewer.
      const va = Math.atan2(G.py - e.y, G.px - e.x);
      const rot = Math.round((va - e.facing) / (Math.PI / 4)) & 7;
      const { img, flip } = rotPick(rf, rot);
      return {
        x: e.x,
        y: e.y,
        img,
        label: e.msg.subject,
        cursed: e.cursed,
        boss: e.kind === 'boss',
        dying: e.dying,
        bob: e.bob,
        glow: e.glow,
        flash: e.state === 'pain' ? 0.6 : 0,
        flipX: flip !== (rf.rotating ? false : e.flipX),
        scale: G.assets ? G.assets.demons[e.kind].worldH : KIND[e.kind].scale,
        yOff,
        enemy: ei,
        alpha:
          e.kind === 'phantom' && e.dying === 0
            ? 0.45 + 0.55 * Math.abs(Math.sin(performance.now() / 1000 * 7 + e.bob))
            : 1,
      };
    }).concat(
      // Decoration things — animated at 8fps, no label.
      G.things
        .filter((t) => !t.dead)
        .map((t) => {
          const fr = G.assets?.things[t.def.lump] || [];
          const img = fr.length
            ? fr[Math.floor((performance.now() / 125 + t.animOff * 8) % fr.length)]
            : dustImg;
          return {
            x: t.x,
            y: t.y,
            img,
            label: '',
            cursed: false,
            boss: false,
            dying: 0,
            bob: 0,
            glow: 0,
            flipX: false,
            scale: t.def.scale,
            yOff: 0,
            alpha: 1,
            hang: t.def.hang,
          };
        }),
    ),
    particles: [
      ...G.particles.map((p) => ({
        x: p.x,
        y: p.y,
        z: p.z,
        img: p.frames
          ? p.frames[Math.min(p.frames.length - 1, Math.floor((1 - p.life / p.maxLife) * p.frames.length))]
          : p.img,
        size: p.size,
        alpha: Math.min(1, p.life / Math.min(1, p.maxLife)),
      })),
      ...(G.projectile
        ? [{ x: G.projectile.x, y: G.projectile.y, z: G.projectile.z, img: G.projectile.img, size: 0.22, alpha: 1 }]
        : []),
      ...G.shots.map((sh) => ({
        x: sh.x,
        y: sh.y,
        z: sh.z,
        img: sh.img,
        size: sh.size,
        alpha: 1,
        additive: true,
      })),
    ],
  };
}

// Current viewmodel frame + offsets.
function vmDraw(): VmDraw {
  const frames = activeWeapons[G.weapon];
  let img = frames.idle || frames.idle1;
  let flash: HTMLCanvasElement | null = null;
  let flashX = 0;
  let flashY = 0;
  const stage = G.vmSeq[0];
  if (G.weapon === 'chainsaw') {
    const revving = G.mouseDown;
    const rate = revving ? 12 : 4;
    img = Math.floor(performance.now() / 1000 * rate) % 2 ? frames.idle2 : frames.idle1;
    if (revving && pickTargetCache) img = frames.cut;
  } else if (G.weapon === 'spell') {
    if (stage === 'cast') img = frames.cast;
    else if (stage === 'recover') img = frames.recover;
    else img = Math.floor(performance.now() / 1000 * 6) % 2 ? frames.idle2 : frames.idle1;
  } else if (stage) {
    img = frames[stage] || img;
    if (stage === 'fire' && !G.assetsLoaded) {
      // procedural overlay only — Freedoom SHTF/PISF frames carry their own flash
      flash = muzzleFlashFrames[Math.floor(performance.now() / 40) % 2];
      flashY = -6 * VM_SCALE;
      flashX = G.weapon === 'shotgun' ? 0 : -7 * VM_SCALE;
    }
  }
  const bobX = Math.sin(G.vmBobT) * (G.keys.size ? 3 : 1.2);
  const bobY = Math.abs(Math.cos(G.vmBobT)) * (G.keys.size ? 3 : 1);
  const lowerY = G.switchT > 0 ? (0.12 - G.switchT) / 0.12 * 60 : G.switchT < 0 ? (-G.switchT / 0.12) * 60 : 0;
  return { img, kick: G.vmKick, bobX, bobY, lowerY, flash, flashX, flashY };
}

// Set while the chainsaw has a live target under the blade (for the cut frame).
let pickTargetCache = false;

// Mugshot state resolved for the HUD ('glum' = streak dead >5s).
function faceState(nowMs: number): 'look' | 'ouch' | 'grin' | 'glum' {
  const f = G.face;
  if (nowMs / 1000 < f.until) return f.state;
  if (G.streak === 0 && f.deadT > 0 && nowMs / 1000 - f.deadT > 5) return 'glum';
  return 'look';
}

function renderFrame() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (G.screen === 'boot') {
    drawCenterText(ctx, [
      { text: 'ZERO RAID — SUMMONING DEMONS…' },
      ...(G.loadPct > 0 && G.loadPct < 100
        ? [{ text: `LOADING FREEDOOM ART… ${G.loadPct}%`, color: '#908880' }]
        : []),
    ]);
    return;
  }
  if (G.screen === 'title') {
    drawTitle();
    return;
  }
  if (G.screen === 'win') {
    drawCenterText(ctx, [
      { text: '★ INBOX ZERO ★', color: '#f0d040' },
      { text: `FINAL SCORE ${G.score}`, color: '#e8e0d0' },
      { text: `${G.actions.length} actions/min · best streak ${G.bestStreak}`, color: '#908880' },
      {
        text: `${G.rooms.reduce((n, r) => n + r.unread.length, 0)} unread remain across the dungeon`,
        color: '#908880',
      },
      { text: 'PRESS R TO RAID AGAIN', color: '#40e060' },
    ]);
    return;
  }
  if (G.screen === 'tally') {
    const s = G.levelStats;
    drawCenterText(ctx, [
      { text: `LEVEL ${G.level + 1} CLEARED — ${G.rooms[G.level]?.name || ''}`, color: '#e06030' },
      { text: `DEMONS SLAIN   ${s.kills}`, color: '#e8e0d0' },
      { text: `REPLIES SENT   ${s.replies}`, color: '#c090ff' },
      { text: `STARS          ${s.stars}`, color: '#f0d040' },
      { text: `TIME           ${s.time.toFixed(1)}s`, color: '#e8e0d0' },
      { text: `BEST STREAK    ${G.bestStreak}`, color: '#f04030' },
      { text: 'PRESS ENTER', color: '#40e060' },
    ]);
    return;
  }

  ctx.save();
  if (G.shakeT > 0) {
    const m = G.shakeT / 0.4;
    ctx.translate((Math.random() * 2 - 1) * 2 * m, (Math.random() * 2 - 1) * 2 * m);
  }
  render(ctx, sceneObj());
  ctx.restore();

  pickTargetCache = false;
  if (G.weapon === 'chainsaw' && G.mouseDown) {
    pickTargetCache = !!pickTarget(sceneObj(), 0.25, 1.8);
  }
  drawWeapon(ctx, vmDraw(), G.hitmarkT > 0 ? (G.hitmarkShield ? -1 : 1) : 0);

  // Brass casings bounce across the HUD layer.
  for (const c of G.casings) {
    ctx.drawImage(casingImg, Math.floor(c.x), Math.floor(c.y));
  }

  drawHud(ctx, {
    streak: G.streak,
    apm: G.actions.length,
    score: G.score,
    weapon: G.weapon,
    face: { state: faceState(performance.now()), lookDir: G.face.lookDir },
    roomName: G.rooms[G.level]?.name || '',
    rooms: G.rooms.map((r, i) => ({
      name: r.name,
      remaining:
        i === G.level ? r.unread.length : i < G.level || G.cleared.has(i) ? 0 : r.unread.length,
      cleared: G.cleared.has(i),
      current: i === G.level,
    })),
    demo: G.demo,
  });

  // Automap — corner mini version always; full overlay while TAB held.
  if (G.map) {
    const seenDoors = new Set<number>();
    for (const d of G.map.doors) {
      if (G.roomVisited.has(d.rooms[0]) || G.roomVisited.has(d.rooms[1])) seenDoors.add(d.id);
    }
    const bossRoom = G.map.rooms.find((r) => r.isBoss);
    const am = {
      map: G.map,
      doorOpen,
      visited: G.roomVisited,
      seenDoors,
      bossSeen: bossRoom ? G.roomVisited.has(bossRoom.id) : false,
      exitOpen: G.exitOpen,
      px: G.px,
      py: G.py,
      dir: G.dir,
    };
    if (G.mapHeld) {
      drawAutomap(ctx, am, 20, 16, VIEW_W - 40, VIEW_H - 32, true);
    } else {
      drawAutomap(ctx, am, 6, 6, 70, 70, false);
    }
  }

  const now = performance.now() / 1000;
  const slotOrder: Record<BannerSlot, number> = { level: 0, hint: 1, boss: 2, room: 3, misc: 4 };
  const lines = [...G.banners]
    .sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot])
    .slice(0, 3)
    .map((b) => ({ text: b.text, color: b.color }));
  if (lines.length) drawCenterText(ctx, lines);

  if (G.hurtT > 0) {
    ctx.fillStyle = `rgba(200,20,10,${G.hurtT * 0.35})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawTitle() {
  const cx = VIEW_W / 2;
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = '#8c1810';
  ctx.fillText('ZERO RAID', cx + 2, 52);
  ctx.fillStyle = '#e04030';
  ctx.fillText('ZERO RAID', cx, 50);
  ctx.font = '8px monospace';
  ctx.fillStyle = '#908880';
  ctx.fillText('YOUR INBOX IS A DUNGEON. CLEAR IT.', cx, 66);

  ctx.font = '9px monospace';
  if (G.msg) {
    ctx.fillStyle = '#f04030';
    ctx.fillText(`API ERROR: ${G.msg}`, cx, 92);
    ctx.fillStyle = '#908880';
    ctx.fillText('is the API running? npm run dev', cx, 106);
  } else if (!G.status) {
    ctx.fillText('…', cx, 92);
  } else if (G.status.connected) {
    ctx.fillStyle = '#40e060';
    const tag = G.demo ? 'DEMO MODE (simulated sends)' : `LIVE: ${G.status.email}`;
    ctx.fillText(tag, cx, 90);
    ctx.fillStyle = '#f0d040';
    ctx.fillText('PRESS ENTER TO RAID', cx, 112);
  } else {
    ctx.fillStyle = '#f0d040';
    ctx.fillText('PRESS ENTER — CONNECT GMAIL', cx, 96);
    ctx.fillStyle = '#908880';
    ctx.fillText('OR D — DEMO MODE (no real mail)', cx, 112);
  }

  ctx.fillStyle = '#605850';
  ctx.font = '7px monospace';
  ctx.fillText('WASD move · mouse turn · 1 archive · 2 trash · 3 star · 4 reply-spell · TAB map', cx, 148);
  ctx.fillText('violet demons need a real reply — or a chainsaw', cx, 158);
  ctx.fillText(
    G.assetsLoaded ? 'art+sfx: Freedoom (BSD) — freedoom.github.io' : 'art: procedural fallback',
    cx,
    168,
  );
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- input ---
const WEAPON_KEYS: Record<string, Weapon> = { '1': 'pistol', '2': 'shotgun', '3': 'chainsaw', '4': 'spell' };

document.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === 'tab') {
    e.preventDefault();
    G.mapHeld = true;
    return;
  }
  if (G.screen === 'title') {
    if (k === 'enter') {
      if (G.status?.connected) {
        loadLevel(0);
        G.screen = 'play';
        sfx.door();
      } else {
        window.location.href = '/api/auth';
      }
    } else if (k === 'd' && G.status && !G.status.connected) {
      window.location.href = '/api/auth?demo=1';
    }
    return;
  }
  if (G.screen === 'win' && k === 'r') {
    window.location.reload();
    return;
  }
  if (G.screen === 'tally') {
    if (k === 'enter') nextLevel();
    return;
  }
  if (G.screen !== 'play') return;
  G.keys.add(k);
  if (WEAPON_KEYS[k]) {
    const w = WEAPON_KEYS[k];
    if (w === 'spell') {
      G.weapon = 'spell';
      fire(); // select+cast in one keypress
    } else {
      switchWeapon(w);
    }
  }
  if (k === 'e') {
    G.weapon = 'spell';
    fire();
  }
  if (e.key === 'PageUp') G.lookPitch = Math.min(48, G.lookPitch + 4);
  if (e.key === 'PageDown') G.lookPitch = Math.max(-48, G.lookPitch - 4);
  if (e.key === 'Home') G.lookPitch = 0;
});

document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'tab') G.mapHeld = false;
  G.keys.delete(k);
});

canvas.addEventListener('mousedown', (e) => {
  sfx.unlock();
  if (G.screen !== 'play') return;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
  if (e.button === 0) {
    G.mouseDown = true;
    if (G.weapon === 'chainsaw') return; // hold-to-saw
    fire();
  } else if (e.button === 2) {
    const prev = G.weapon;
    G.weapon = 'shotgun';
    fire();
    G.weapon = prev;
  }
});
document.addEventListener('mouseup', () => {
  G.mouseDown = false;
  sfx.chainsawStop();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    G.mouseDx += e.movementX;
    // Vertical look: pointer up (negative movementY) looks up.
    G.lookPitch = Math.min(48, Math.max(-48, G.lookPitch + e.movementY * 0.25));
  }
});
document.addEventListener('wheel', (e) => {
  if (G.screen !== 'play') return;
  const order: Weapon[] = ['pistol', 'shotgun', 'chainsaw', 'spell'];
  const i = order.indexOf(G.weapon);
  const n = (i + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length;
  switchWeapon(order[n]);
});

// ----------------------------------------------------------------- loop ---
let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (dt > 0) G.fps = G.fps * 0.9 + (1 / dt) * 0.1;
  update(dt, now / 1000);
  renderFrame();
  requestAnimationFrame(frame);
}
void boot();
requestAnimationFrame(frame);

// Dev-only handle for automated playtesting/debugging.
if (import.meta.env.DEV) {
  (window as unknown as {
    __zr: typeof G & { spawnTest: typeof spawnEnemy; loadLevel: typeof loadLevel };
  }).__zr = Object.assign(G, { spawnTest: spawnEnemy, loadLevel });
}
