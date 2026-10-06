// DOOM status bar + weapon viewmodel + room mini-map + automap. Canvas-drawn.
import { VIEW_W, VIEW_H } from './engine';
import type { LevelMap } from './map';
import type { RoomData } from './types';

export type Weapon = 'pistol' | 'shotgun' | 'chainsaw' | 'spell';

export const WEAPON_META: Record<Weapon, { name: string; verb: string; key: string }> = {
  pistol: { name: 'PISTOL', verb: 'ARCHIVE', key: '1' },
  shotgun: { name: 'SHOTGUN', verb: 'TRASH', key: '2' },
  chainsaw: { name: 'CHAINSAW', verb: 'STAR', key: '3' },
  spell: { name: 'HELLFIRE', verb: 'REPLY', key: '4' },
};

export interface HudState {
  streak: number;
  apm: number;
  score: number;
  weapon: Weapon;
  face: { state: 'look' | 'ouch' | 'grin' | 'glum'; lookDir: number };
  roomName: string;
  rooms: { name: string; remaining: number; cleared: boolean; current: boolean }[];
  demo: boolean;
}

const BAR_H = 40;

export function drawHud(ctx: CanvasRenderingContext2D, s: HudState): void {
  const y0 = VIEW_H; // status bar starts below the 3D viewport
  const H = ctx.canvas.height;
  void H;

  // Status bar background — brushed metal look.
  ctx.fillStyle = '#241f1c';
  ctx.fillRect(0, y0, VIEW_W, BAR_H);
  ctx.fillStyle = '#3a332e';
  ctx.fillRect(0, y0, VIEW_W, 2);
  ctx.fillStyle = '#161311';
  ctx.fillRect(0, y0 + BAR_H - 2, VIEW_W, 2);

  ctx.textBaseline = 'middle';
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';

  // STREAK (health) — big red doom digits
  label(ctx, 'STREAK', 8, y0 + 7, '#7a706a');
  doomNum(ctx, String(s.streak).padStart(2, '0'), 8, y0 + 23, s.streak > 0 ? '#f03020' : '#603030');

  // APM (ammo)
  ctx.font = '8px monospace';
  label(ctx, 'APM', 56, y0 + 7, '#7a706a');
  doomNum(ctx, String(Math.round(s.apm)).padStart(3, '0'), 56, y0 + 23, '#f03020');

  // SCORE — yellow
  ctx.font = '8px monospace';
  label(ctx, 'SCORE', 106, y0 + 7, '#7a706a');
  doomNum(ctx, String(s.score).padStart(6, '0'), 106, y0 + 23, '#f0d040');

  // The Doomguy — face reads your streak.
  drawFace(ctx, s.face.state, s.face.lookDir, s.streak, 178, y0 + 5);

  // Weapon
  ctx.font = '8px monospace';
  label(ctx, 'WEAPON', 214, y0 + 7, '#7a706a');
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#c0b8a8';
  ctx.fillText(WEAPON_META[s.weapon].name, 214, y0 + 20);
  ctx.font = '7px monospace';
  ctx.fillStyle = '#706a60';
  ctx.fillText(`=${WEAPON_META[s.weapon].verb}`, 214, y0 + 30);

  // Room name
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#90c060';
  ctx.fillText(s.roomName, VIEW_W - 8, y0 + 10);
  if (s.demo) {
    ctx.font = '7px monospace';
    ctx.fillStyle = '#c08030';
    ctx.fillText('DEMO MODE', VIEW_W - 8, y0 + 21);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  drawMinimap(ctx, s.rooms);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.font = '7px monospace';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Big outlined digits, Doom status-bar style.
function doomNum(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  ctx.font = 'bold 12px monospace';
  ctx.strokeStyle = '#100c0a';
  ctx.lineWidth = 2;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// ---- Doomguy mugshot -------------------------------------------------------
// 24x29 procedural face; cached per (state, lookDir, bloodLevel).
const faceCache = new Map<string, HTMLCanvasElement>();

function faceImg(state: string, lookDir: number, blood: number): HTMLCanvasElement {
  const key = `${state}:${lookDir}:${blood}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 29;
  const g = c.getContext('2d')!;
  const skin = blood >= 3 ? '#a87850' : '#c89060';
  const shade = '#8a5c38';
  // skull
  g.fillStyle = skin;
  g.fillRect(5, 4, 14, 20);
  g.fillRect(7, 24, 10, 3); // jaw
  // hair — dark buzz
  g.fillStyle = '#2a2018';
  g.fillRect(4, 1, 16, 5);
  g.fillRect(4, 4, 2, 4);
  g.fillRect(18, 4, 2, 4);
  // brow shading
  g.fillStyle = shade;
  g.fillRect(5, 11, 14, 1);
  // eyes
  const ex = lookDir; // -1 left .. +1 right
  if (state === 'ouch') {
    // squeezed shut
    g.fillStyle = '#201810';
    g.fillRect(7, 13, 3, 1);
    g.fillRect(14, 13, 3, 1);
  } else {
    g.fillStyle = '#f0f0e8';
    g.fillRect(7 + ex, 12, 4, 3);
    g.fillRect(14 + ex, 12, 4, 3);
    g.fillStyle = '#181008';
    g.fillRect(8 + ex * 2, 13, 2, 2);
    g.fillRect(15 + ex * 2, 13, 2, 2);
  }
  // nose
  g.fillStyle = shade;
  g.fillRect(11, 15, 2, 4);
  // mouth
  g.fillStyle = '#38180c';
  if (state === 'grin') {
    g.fillRect(8, 20, 8, 3);
    g.fillStyle = '#e0d8c0';
    g.fillRect(8, 20, 8, 1);
  } else if (state === 'ouch') {
    g.fillRect(9, 20, 6, 4);
  } else if (state === 'glum') {
    g.fillRect(8, 22, 8, 1);
    g.fillRect(7, 21, 1, 1);
    g.fillRect(16, 21, 1, 1);
  } else {
    g.fillRect(9, 21, 6, 1);
  }
  // chin shadow + ears
  g.fillStyle = shade;
  g.fillRect(8, 26, 8, 1);
  g.fillRect(3, 12, 2, 5);
  g.fillRect(19, 12, 2, 5);
  // blood by streak
  if (blood > 0) {
    g.fillStyle = '#901010';
    if (blood >= 1) g.fillRect(6, 6, 3, 4); // forehead cut
    if (blood >= 2) {
      g.fillRect(16, 9, 2, 8);
      g.fillRect(4, 16, 2, 5);
    }
    if (blood >= 3) {
      g.fillStyle = 'rgba(120,10,10,0.55)';
      g.fillRect(5, 4, 14, 20); // heavy soak
      g.fillStyle = '#701010';
      g.fillRect(9, 8, 6, 3);
    }
  }
  faceCache.set(key, c);
  return c;
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  state: string,
  lookDir: number,
  streak: number,
  x: number,
  y: number,
) {
  // blood level by streak: >=10 clean, 5-9 cuts, 1-4 bloody, 0 very bloody
  const blood = streak >= 10 ? 0 : streak >= 5 ? 1 : streak >= 1 ? 2 : 3;
  const img = faceImg(state, lookDir, blood);
  ctx.drawImage(img, x, y);
  ctx.strokeStyle = '#161311';
  ctx.strokeRect(x - 0.5, y - 0.5, img.width + 1, img.height + 1);
}

// Room strip mini-map, top-right of the 3D view.
function drawMinimap(
  ctx: CanvasRenderingContext2D,
  rooms: HudState['rooms'],
): void {
  const bw = 34;
  const bh = 14;
  const x0 = VIEW_W - rooms.length * (bw + 3) - 6;
  const y0 = 6;
  rooms.forEach((r, i) => {
    const x = x0 + i * (bw + 3);
    ctx.fillStyle = r.current ? '#3a2a1a' : '#1a1816';
    ctx.fillRect(x, y0, bw, bh);
    ctx.strokeStyle = r.cleared ? '#40a040' : r.current ? '#e0a030' : '#504840';
    ctx.strokeRect(x + 0.5, y0 + 0.5, bw - 1, bh - 1);
    ctx.font = '6px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = r.cleared ? '#40a040' : '#c0b8a8';
    const tag = r.cleared ? 'CLR' : String(r.remaining);
    ctx.fillText(`${r.name.slice(0, 4)} ${tag}`, x + bw / 2, y0 + 9);
  });
  ctx.textAlign = 'left';
}

// ---- Weapon viewmodel ----------------------------------------------------

export interface VmDraw {
  img: HTMLCanvasElement; // current frame, ~96x96
  kick: number; // px down-offset from recoil
  bobX: number;
  bobY: number;
  lowerY: number; // px down during weapon switch
  flash: HTMLCanvasElement | null; // muzzle flash overlay this frame
  flashX: number; // flash x relative to screen center
  flashY: number; // flash y relative to viewmodel top
}

export function drawWeapon(ctx: CanvasRenderingContext2D, vm: VmDraw, hitmark: number): void {
  const cx = VIEW_W / 2;
  const x = Math.floor(cx - vm.img.width / 2 + vm.bobX);
  const y = Math.floor(VIEW_H - vm.img.height + vm.kick + vm.bobY + vm.lowerY);
  ctx.drawImage(vm.img, x, y);
  if (vm.flash) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(
      vm.flash,
      Math.floor(cx + vm.flashX - vm.flash.width / 2),
      Math.floor(y + vm.flashY),
    );
    ctx.restore();
  }

  // Crosshair — spreads and colors on hits.
  const spread = hitmark !== 0 ? 7 : 4;
  ctx.fillStyle = hitmark > 0 ? '#f03030' : hitmark < 0 ? '#ffffff' : '#e0d040';
  ctx.fillRect(cx - spread, VIEW_H / 2, 3, 1);
  ctx.fillRect(cx + spread - 3, VIEW_H / 2, 3, 1);
  ctx.fillRect(cx, VIEW_H / 2 - spread, 1, 3);
  ctx.fillRect(cx, VIEW_H / 2 + spread - 3, 1, 3);
}

// ---- Automap ---------------------------------------------------------------

export interface AutomapState {
  map: LevelMap;
  doorOpen: (id: number) => number;
  visited: Set<number>;
  seenDoors: Set<number>; // doors the player has been near (reveals neighbors)
  bossSeen: boolean;
  exitOpen: boolean;
  px: number;
  py: number;
  dir: number;
}

export function drawAutomap(
  ctx: CanvasRenderingContext2D,
  s: AutomapState,
  x0: number,
  y0: number,
  boxW: number,
  boxH: number,
  full: boolean,
): void {
  const sc = Math.min(boxW / s.map.w, boxH / s.map.h);
  const ox = x0 + (boxW - s.map.w * sc) / 2;
  const oy = y0 + (boxH - s.map.h * sc) / 2;
  const tx = (x: number) => ox + x * sc;
  const ty = (y: number) => oy + y * sc;

  ctx.save();
  ctx.fillStyle = `rgba(8,8,12,${full ? 0.88 : 0.55})`;
  ctx.fillRect(x0 - 2, y0 - 2, boxW + 4, boxH + 4);

  // Revealable room set: visited rooms + rooms through a seen door.
  const seen = new Set<number>(s.visited);
  for (const d of s.map.doors) {
    if (!s.seenDoors.has(d.id)) continue;
    if (s.visited.has(d.rooms[0])) seen.add(d.rooms[1]);
    if (s.visited.has(d.rooms[1])) seen.add(d.rooms[0]);
  }

  for (const r of s.map.rooms) {
    const rx = tx(r.x0);
    const ry = ty(r.y0);
    const rw = (r.x1 - r.x0 + 1) * sc;
    const rh = (r.y1 - r.y0 + 1) * sc;
    if (s.visited.has(r.id)) {
      ctx.fillStyle = r.isBoss ? '#3a1414' : '#26221e';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#8a8078';
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
      if (r.isBoss) {
        ctx.font = `${Math.max(6, Math.floor(4 * sc))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f04040';
        ctx.fillText('☠', rx + rw / 2, ry + rh / 2 + 2);
      }
    } else if (seen.has(r.id)) {
      ctx.strokeStyle = '#4a443c';
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
    }
  }

  // Doors as little ticks across the walls.
  for (const d of s.map.doors) {
    const adjacentSeen = s.visited.has(d.rooms[0]) || s.visited.has(d.rooms[1]);
    if (!adjacentSeen && !full) continue;
    const open = s.doorOpen(d.id);
    ctx.strokeStyle = open >= 0.8 ? '#50d060' : '#d04040';
    ctx.lineWidth = Math.max(1, sc * 0.3);
    ctx.beginPath();
    if (d.axis === 'v') {
      ctx.moveTo(tx(d.x) + sc / 2, ty(d.y));
      ctx.lineTo(tx(d.x) + sc / 2, ty(d.y + 1));
    } else {
      ctx.moveTo(tx(d.x), ty(d.y) + sc / 2);
      ctx.lineTo(tx(d.x + 1), ty(d.y) + sc / 2);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // Exit glyph once it's open (or always, in full map after boss room seen).
  if (s.exitOpen || (full && s.bossSeen)) {
    ctx.font = `bold ${Math.max(6, Math.floor(5 * sc))}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#40e060';
    ctx.fillText('E', tx(s.map.exit.x) + sc / 2, ty(s.map.exit.y) + sc / 2 + 2);
  }

  // Player dot + facing tick.
  const px = tx(s.px);
  const py = ty(s.py);
  ctx.fillStyle = '#f0d040';
  ctx.fillRect(px - 1, py - 1, Math.max(2, sc * 0.25), Math.max(2, sc * 0.25));
  ctx.strokeStyle = '#f0d040';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(s.dir) * sc * 0.8, py + Math.sin(s.dir) * sc * 0.8);
  ctx.stroke();

  if (full) {
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e0d040';
    ctx.fillText('AUTOMAP', x0 + 4, y0 + 12);
    ctx.font = '6px monospace';
    ctx.fillStyle = '#50d060';
    ctx.fillText('■ open door', x0 + 4, y0 + boxH - 14);
    ctx.fillStyle = '#d04040';
    ctx.fillText('■ locked door', x0 + 4, y0 + boxH - 6);
  }
  ctx.restore();
}

export function drawCenterText(
  ctx: CanvasRenderingContext2D,
  lines: { text: string; color?: string }[],
): void {
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    const y = 50 + i * 12;
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(line.text, VIEW_W / 2 + 1, y + 1);
    ctx.fillStyle = line.color || '#f0d040';
    ctx.fillText(line.text, VIEW_W / 2, y);
  });
  ctx.textAlign = 'left';
}

export const HUD_BAR_H = BAR_H;
