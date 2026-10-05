// DOOM status bar + weapon viewmodel + room mini-map. All canvas-drawn.
import { VIEW_W, VIEW_H } from './engine';
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

export function drawWeapon(
  ctx: CanvasRenderingContext2D,
  weapon: Weapon,
  fireAnim: number, // 0..1, decays after firing
  sawOn: boolean,
  time: number,
): void {
  const cx = VIEW_W / 2;
  const base = VIEW_H;
  const kick = fireAnim * 8;
  const sway = Math.sin(time * 1.5) * 1.5;

  ctx.save();
  ctx.translate(0, sway + kick);

  if (weapon === 'pistol') {
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(cx - 6, base - 26, 12, 26);
    ctx.fillStyle = '#44444e';
    ctx.fillRect(cx - 4, base - 34, 8, 12);
    ctx.fillStyle = '#1a1a20';
    ctx.fillRect(cx - 2, base - 36, 4, 4);
  } else if (weapon === 'shotgun') {
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(cx - 16, base - 24, 32, 24);
    ctx.fillStyle = '#2e2e38';
    ctx.fillRect(cx - 14, base - 38, 12, 16);
    ctx.fillRect(cx + 2, base - 38, 12, 16);
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(cx - 12, base - 40, 8, 4);
    ctx.fillRect(cx + 4, base - 40, 8, 4);
  } else if (weapon === 'chainsaw') {
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(cx - 20, base - 22, 40, 22);
    ctx.fillStyle = '#6a7078';
    ctx.fillRect(cx - 8, base - 44, 16, 24);
    ctx.fillStyle = '#9aa0a8';
    for (let i = 0; i < 6; i++) {
      const tooth = ((time * 30) % 8) - 4;
      ctx.fillRect(cx - 10 + (sawOn ? tooth : 0), base - 42 + i * 4, 4, 2);
      ctx.fillRect(cx + 6 - (sawOn ? tooth : 0), base - 42 + i * 4, 4, 2);
    }
    ctx.fillStyle = '#b03020';
    ctx.fillRect(cx - 14, base - 22, 28, 6);
  } else {
    // Hellfire spell — a clawed hand wreathed in flame.
    ctx.fillStyle = '#7a4a2a';
    ctx.fillRect(cx - 12, base - 18, 24, 18);
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(cx + i * 8 - 3, base - 26 - Math.abs(i) * 3, 6, 10);
    }
    const flicker = Math.sin(time * 20) * 2;
    ctx.fillStyle = '#e06020';
    ctx.fillRect(cx - 8, base - 36 - flicker, 16, 10);
    ctx.fillStyle = '#f0c030';
    ctx.fillRect(cx - 4, base - 40 - flicker, 8, 8);
  }

  // Muzzle flash
  if (fireAnim > 0.3) {
    ctx.fillStyle = `rgba(240,200,60,${fireAnim})`;
    const fy = weapon === 'shotgun' ? base - 52 : base - 46;
    ctx.beginPath();
    ctx.arc(cx, fy, 10 * fireAnim, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Crosshair
  ctx.fillStyle = '#e0d040';
  ctx.fillRect(cx - 4, VIEW_H / 2, 3, 1);
  ctx.fillRect(cx + 2, VIEW_H / 2, 3, 1);
  ctx.fillRect(cx, VIEW_H / 2 - 4, 1, 3);
  ctx.fillRect(cx, VIEW_H / 2 + 2, 1, 3);
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
