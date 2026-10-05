import { render, pickTarget, targetsInCone, VIEW_W, VIEW_H, type Scene } from './engine';
import { makeLevel, isSolid, cellAt, type LevelMap } from './map';
import { sprites, makeWallTexture, makeDoorTexture } from './sprites';
import { drawHud, drawWeapon, drawCenterText, HUD_BAR_H, WEAPON_META, type Weapon } from './hud';
import { sfx } from './sfx';
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
type Screen = 'boot' | 'title' | 'play' | 'reply' | 'trans' | 'win' | 'dead';

interface Enemy {
  msg: UnreadMsg;
  x: number;
  y: number;
  cursed: boolean;
  dying: number;
  dead: boolean;
  glow: number;
  bob: number;
  attackT: number;
  sawT: number;
}

interface Banner {
  text: string;
  color: string;
  until: number;
}

const G = {
  screen: 'boot' as Screen,
  status: null as StatusResponse | null,
  rooms: [] as RoomData[],
  demo: false,
  level: 0,
  map: null as LevelMap | null,
  doorOpen: false,
  px: 0,
  py: 0,
  dir: -Math.PI / 2,
  enemies: [] as Enemy[],
  pending: [] as UnreadMsg[],
  spawnT: 0,
  weapon: 'pistol' as Weapon,
  fireT: 0,
  fireAnim: 0,
  mouseDown: false,
  streak: 0,
  score: 0,
  actions: [] as number[],
  hurtT: 0,
  banners: [] as Banner[],
  transT: 0,
  cleared: new Set<number>(),
  busy: 0,
  keys: new Set<string>(),
  mouseDx: 0,
  msg: '', // boot error
};

const wallTex = makeWallTexture();
const doorTex = makeDoorTexture();

const SCORE: Record<RaidAction | 'reply', number> = {
  archive: 10,
  trash: 12,
  star: 25,
  reply: 40,
};

// ---------------------------------------------------------------- boot ----
async function boot() {
  try {
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

function banner(text: string, color = '#f0d040', secs = 2.2) {
  G.banners.push({ text, color, until: performance.now() / 1000 + secs });
}

// ------------------------------------------------------------ level load --
function loadLevel(i: number) {
  G.level = i;
  G.map = makeLevel(i);
  G.px = G.map.spawn.x;
  G.py = G.map.spawn.y;
  G.dir = -Math.PI / 2;
  G.enemies = [];
  G.pending = [...G.rooms[i].unread];
  G.doorOpen = false;
  G.spawnT = 0;
  const room = G.rooms[i];
  banner(`LEVEL ${i + 1}: ${room.name}`, '#e06030', 3);
  if (G.pending.length === 0) {
    G.doorOpen = true;
    banner('ALREADY CLEAN — HEAD FOR THE DOOR', '#40e060', 3);
  }
}

function aliveCount(): number {
  return G.enemies.filter((e) => !e.dead && e.dying === 0).length;
}

function roomMaxConcurrent(): number {
  return Math.min(6 + G.level, 10);
}

function spawnEnemy(msg: UnreadMsg) {
  const map = G.map!;
  const free = map.spawnPoints.filter(
    (p) =>
      cellAt(map, p.x, p.y) === '.' &&
      Math.hypot(p.x - G.px, p.y - G.py) > 3 &&
      !G.enemies.some((e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 1),
  );
  if (!free.length) return false;
  const p = free[Math.floor(Math.random() * free.length)];
  G.enemies.push({
    msg,
    x: p.x,
    y: p.y,
    cursed: msg.needsReply,
    dying: 0,
    dead: false,
    glow: 0,
    bob: Math.random() * Math.PI * 2,
    attackT: 0,
    sawT: 0,
  });
  return true;
}

// --------------------------------------------------------------- actions --
function doAction(enemy: Enemy, action: RaidAction) {
  enemy.dying = 0.0001;
  sfx.demonDie();
  G.streak++;
  G.score += SCORE[action];
  G.actions.push(Date.now());
  api
    .modify(enemy.msg.id, action)
    .then(() => {
      const unread = G.rooms[G.level].unread;
      const i = unread.findIndex((m) => m.id === enemy.msg.id);
      if (i >= 0) unread.splice(i, 1);
    })
    .catch((err) => {
      enemy.dying = 0; // roll back — the mail survived
      G.streak = 0;
      banner(`FAILED: ${String(err).slice(0, 40)}`, '#f04030', 3);
    });
}

async function castSpell(enemy: Enemy) {
  G.screen = 'reply';
  sfx.spellCast();
  document.exitPointerLock?.();
  const body = await showReplyOverlay(enemy.msg, G.demo);
  G.screen = 'play';
  if (body === null) {
    banner('SPELL SHEATHED', '#908880', 1.5);
    return;
  }
  G.busy++;
  enemy.dying = 0.0001;
  sfx.explosion();
  G.streak++;
  G.score += SCORE.reply;
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

function fire() {
  if (G.fireT > 0 || !G.map) return;
  const scene = sceneObj();
  switch (G.weapon) {
    case 'pistol': {
      G.fireT = 0.35;
      G.fireAnim = 1;
      sfx.pistol();
      const t = pickTarget(scene, 0.055, 14);
      if (!t) return;
      const e = G.enemies[t.idx];
      if (e.cursed) {
        e.glow = 1;
        sfx.shieldPing();
        banner('REPLY REQUIRED — HELLFIRE [4] OR CHAINSAW-STAR [3]', '#c090ff');
        return;
      }
      doAction(e, 'archive');
      break;
    }
    case 'shotgun': {
      G.fireT = 1.1;
      G.fireAnim = 1;
      sfx.shotgun();
      const idxs = targetsInCone(scene, 0.2, 6.5);
      for (const i of idxs) {
        const e = G.enemies[i];
        if (e.cursed) {
          e.glow = 1;
          sfx.shieldPing();
        } else {
          doAction(e, 'trash');
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
      void castSpell(G.enemies[t.idx]);
      break;
    }
    case 'chainsaw':
      break; // handled by hold logic in update
  }
}

// ---------------------------------------------------------------- update --
function update(dt: number, now: number) {
  G.banners = G.banners.filter((b) => b.until > now);
  G.actions = G.actions.filter((t) => Date.now() - t < 60_000);
  G.fireT = Math.max(0, G.fireT - dt);
  G.fireAnim = Math.max(0, G.fireAnim - dt * 6);
  G.hurtT = Math.max(0, G.hurtT - dt * 2);
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
  if (mx || my) {
    const len = Math.hypot(mx, my);
    const nx = G.px + (mx / len) * SPEED * dt;
    const ny = G.py + (my / len) * SPEED * dt;
    const R = 0.22;
    if (!isSolid(G.map, nx + Math.sign(nx - G.px) * R, G.py, G.doorOpen)) G.px = nx;
    if (!isSolid(G.map, G.px, ny + Math.sign(ny - G.py) * R, G.doorOpen)) G.py = ny;
  }

  // Stepped through the exit?
  if (G.doorOpen && cellAt(G.map, G.px, G.py) === 'D') {
    nextLevel();
    return;
  }

  // Spawning — trickle pending unread in as demons.
  G.spawnT -= dt;
  if (G.pending.length && G.spawnT <= 0 && aliveCount() < roomMaxConcurrent()) {
    const msg = G.pending.shift()!;
    if (spawnEnemy(msg)) G.spawnT = 0.6;
    else G.pending.unshift(msg);
  }

  // Enemy AI — drift toward the player, maul on contact.
  const aggroR = 4.5 + G.level * 0.7;
  const speed = 0.28 + G.level * 0.1;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.glow = Math.max(0, e.glow - dt * 3);
    e.attackT -= dt;
    if (e.dying > 0) {
      e.dying += dt * 2.2;
      if (e.dying >= 1) e.dead = true;
      continue;
    }
    const dx = G.px - e.x;
    const dy = G.py - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < aggroR && dist > 0.55) {
      const nx = e.x + (dx / dist) * speed * dt;
      const ny = e.y + (dy / dist) * speed * dt;
      if (!isSolid(G.map, nx, e.y, G.doorOpen)) e.x = nx;
      if (!isSolid(G.map, e.x, ny, G.doorOpen)) e.y = ny;
    }
    if (dist < 0.8 && e.attackT <= 0) {
      e.attackT = 1.6;
      if (G.streak > 0) banner('STREAK BROKEN', '#f04030', 1.5);
      G.streak = 0;
      G.hurtT = 0.5;
      sfx.hurt();
    }
  }
  G.enemies = G.enemies.filter((e) => !e.dead);

  // Chainsaw hold
  if (G.weapon === 'chainsaw' && G.mouseDown) {
    sfx.chainsawStart();
    const t = pickTarget(sceneObj(), 0.25, 1.8);
    if (t) {
      const e = G.enemies[t.idx];
      e.sawT += dt;
      if (e.sawT > 0.55) {
        e.sawT = -999;
        doAction(e, 'star'); // works on cursed too — star = "deal with it later"
      }
    }
  } else {
    sfx.chainsawStop();
    for (const e of G.enemies) e.sawT = Math.max(0, e.sawT - dt * 2);
  }

  // Room cleared?
  if (!G.doorOpen && !G.pending.length && aliveCount() === 0) {
    G.doorOpen = true;
    G.cleared.add(G.level);
    sfx.door();
    banner('ROOM CLEARED — THE DOOR GRINDS OPEN', '#40e060', 3);
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

// ---------------------------------------------------------------- render --
function sceneObj(): Scene {
  return {
    map: G.map!,
    px: G.px,
    py: G.py,
    dir: G.dir,
    doorOpen: G.doorOpen,
    wallTex,
    doorTex,
    time: performance.now() / 1000,
    sprites: G.enemies.map((e) => ({
      x: e.x,
      y: e.y,
      img: e.cursed ? sprites.cursed : sprites.imp,
      label: e.msg.subject,
      cursed: e.cursed,
      dying: e.dying,
      bob: e.bob,
      glow: e.glow,
    })),
  };
}

function renderFrame() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (G.screen === 'boot') {
    drawCenterText(ctx, [{ text: 'ZERO RAID — SUMMONING DEMONS…' }]);
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
      { text: `${G.actions.length} actions/min · best streak this run`, color: '#908880' },
      { text: 'PRESS R TO RAID AGAIN', color: '#40e060' },
    ]);
    return;
  }

  render(ctx, sceneObj());
  drawWeapon(ctx, G.weapon, G.fireAnim, G.weapon === 'chainsaw' && G.mouseDown, performance.now() / 1000);
  drawHud(ctx, {
    streak: G.streak,
    apm: G.actions.length,
    score: G.score,
    weapon: G.weapon,
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

  // Banners
  const now = performance.now() / 1000;
  const lines = G.banners.slice(-3).map((b) => ({ text: b.text, color: b.color }));
  if (lines.length) drawCenterText(ctx, lines);

  // Hurt flash
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
  ctx.fillText('WASD move · mouse turn · 1 archive · 2 trash · 3 star · 4 reply-spell', cx, 148);
  ctx.fillText('violet demons need a real reply — or a chainsaw', cx, 158);
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- input ---
const WEAPON_KEYS: Record<string, Weapon> = { '1': 'pistol', '2': 'shotgun', '3': 'chainsaw', '4': 'spell' };

document.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
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
  if (G.screen !== 'play') return;
  G.keys.add(k);
  if (WEAPON_KEYS[k]) {
    G.weapon = WEAPON_KEYS[k];
    if (G.weapon !== 'chainsaw') sfx.chainsawStop();
    if (G.weapon === 'spell') fire(); // select+cast in one keypress
  }
  if (k === 'e') {
    G.weapon = 'spell';
    fire();
  }
});

document.addEventListener('keyup', (e) => G.keys.delete(e.key.toLowerCase()));

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
    // right click = shotgun blast (trash)
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
  if (document.pointerLockElement === canvas) G.mouseDx += e.movementX;
});
document.addEventListener('wheel', (e) => {
  if (G.screen !== 'play') return;
  const order: Weapon[] = ['pistol', 'shotgun', 'chainsaw', 'spell'];
  const i = order.indexOf(G.weapon);
  const n = (i + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length;
  G.weapon = order[n];
});

// ----------------------------------------------------------------- loop ---
let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt, now / 1000);
  renderFrame();
  requestAnimationFrame(frame);
}
void boot();
requestAnimationFrame(frame);

// Dev-only handle for automated playtesting/debugging.
if (import.meta.env.DEV) {
  (window as unknown as { __zr: typeof G }).__zr = G;
}
