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
  roomName: string;
  rooms: { name: string; remaining: number; cleared: boolean; current: boolean }[];
  demo: boolean;
}

const BAR_H = 34;

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

  // STREAK (health)
  label(ctx, 'STREAK', 8, y0 + 8, '#7a706a');
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = s.streak > 0 ? '#f04030' : '#603030';
  ctx.fillText(String(s.streak).padStart(2, '0'), 8, y0 + 22);

  // APM (ammo)
  ctx.font = '8px monospace';
  label(ctx, 'APM', 58, y0 + 8, '#7a706a');
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#e8d040';
  ctx.fillText(String(Math.round(s.apm)).padStart(3, '0'), 58, y0 + 22);

  // SCORE
  ctx.font = '8px monospace';
  label(ctx, 'SCORE', 112, y0 + 8, '#7a706a');
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#e8e0d0';
  ctx.fillText(String(s.score).padStart(6, '0'), 112, y0 + 22);

  // Weapon
  ctx.font = '8px monospace';
  label(ctx, 'WEAPON', 178, y0 + 8, '#7a706a');
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#c0b8a8';
  ctx.fillText(WEAPON_META[s.weapon].name, 178, y0 + 21);
  ctx.font = '7px monospace';
  ctx.fillStyle = '#706a60';
  ctx.fillText(`=${WEAPON_META[s.weapon].verb}`, 178, y0 + 29);

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
