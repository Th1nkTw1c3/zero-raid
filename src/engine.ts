// 2.5D raycaster: textured walls, billboard sprites with per-column z-buffer,
// floating subject labels. Renders at chunky low res, scaled up by CSS.
import { cellAt } from './map';
import type { LevelMap } from './map';

export const VIEW_W = 320;
export const VIEW_H = 160;
const FOV = Math.PI / 3; // 60°
const MAX_DEPTH = 20;

export interface SpriteDraw {
  x: number;
  y: number;
  img: HTMLCanvasElement;
  label: string;
  cursed: boolean;
  boss: boolean;
  dying: number; // 0 = alive, 0..1 death anim progress
  bob: number; // phase offset
  glow: number; // shield-hit flash 0..1
  flipX: boolean;
  scale: number; // 1 for imp/cursed, 2 for boss
  yOff: number; // extra downward offset, fraction of sprite height
}

export interface Scene {
  map: LevelMap;
  px: number;
  py: number;
  dir: number;
  doorOpen: boolean;
  wallTex: HTMLCanvasElement;
  doorTex: HTMLCanvasElement;
  sprites: SpriteDraw[];
  particles: { x: number; y: number; z: number; img: HTMLCanvasElement }[];
  time: number;
}

const zbuf = new Float32Array(VIEW_W);

function shade(dist: number): number {
  return Math.min(0.6, dist * 0.045);
}

export function render(ctx: CanvasRenderingContext2D, s: Scene): void {
  const dirX = Math.cos(s.dir);
  const dirY = Math.sin(s.dir);
  const planeScale = Math.tan(FOV / 2);
  const planeX = -dirY * planeScale;
  const planeY = dirX * planeScale;
  const horizon = VIEW_H / 2;

  // Ceiling — doom-dark gradient.
  const ceil = ctx.createLinearGradient(0, 0, 0, horizon);
  ceil.addColorStop(0, '#0a0a12');
  ceil.addColorStop(1, '#1c1c28');
  ctx.fillStyle = ceil;
  ctx.fillRect(0, 0, VIEW_W, horizon);
  // Floor — brownish gradient.
  const floor = ctx.createLinearGradient(0, horizon, 0, VIEW_H);
  floor.addColorStop(0, '#38302a');
  floor.addColorStop(1, '#181410');
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, VIEW_W, VIEW_H - horizon);

  // Walls — DDA per column.
  for (let col = 0; col < VIEW_W; col++) {
    const camX = (2 * col) / VIEW_W - 1;
    const rdx = dirX + planeX * camX;
    const rdy = dirY + planeY * camX;

    let mapX = Math.floor(s.px);
    let mapY = Math.floor(s.py);
    const deltaX = Math.abs(1 / (rdx || 1e-9));
    const deltaY = Math.abs(1 / (rdy || 1e-9));
    let stepX: number, stepY: number, sideX: number, sideY: number;
    if (rdx < 0) {
      stepX = -1;
      sideX = (s.px - mapX) * deltaX;
    } else {
      stepX = 1;
      sideX = (mapX + 1 - s.px) * deltaX;
    }
    if (rdy < 0) {
      stepY = -1;
      sideY = (s.py - mapY) * deltaY;
    } else {
      stepY = 1;
      sideY = (mapY + 1 - s.py) * deltaY;
    }

    let side = 0;
    let cell = '#';
    for (let i = 0; i < 64; i++) {
      if (sideX < sideY) {
        sideX += deltaX;
        mapX += stepX;
        side = 0;
      } else {
        sideY += deltaY;
        mapY += stepY;
        side = 1;
      }
      cell = cellAt(s.map, mapX, mapY);
      if (cell === '#') break;
      if (cell === 'D' && !s.doorOpen) break;
      if (mapX < 0 || mapY < 0 || mapX >= s.map.w || mapY >= s.map.h) {
        cell = '#';
        break;
      }
    }

    const dist = Math.max(0.05, side === 0 ? sideX - deltaX : sideY - deltaY);
    zbuf[col] = dist;
    const lineH = VIEW_H / dist;
    const y0 = horizon - lineH / 2;

    // Texture column
    let wallX = side === 0 ? s.py + dist * rdy : s.px + dist * rdx;
    wallX -= Math.floor(wallX);
    const tex = cell === 'D' ? s.doorTex : s.wallTex;
    const texX = Math.min(63, Math.floor(wallX * 64));
    ctx.drawImage(tex, texX, 0, 1, 64, col, y0, 1, lineH);

    // Distance + side shading
    let alpha = shade(dist);
    if (side === 1) alpha = Math.min(0.85, alpha + 0.15);
    if (cell === 'D' && !s.doorOpen) {
      // Pulsing locked-door tint
      alpha = Math.min(0.9, alpha + 0.1 + 0.1 * Math.sin(s.time * 4));
    }
    if (alpha > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(col, y0, 1, lineH);
    }
  }

  // Sprites — far to near.
  const sorted = [...s.sprites].sort((a, b) => {
    const da = (a.x - s.px) ** 2 + (a.y - s.py) ** 2;
    const db = (b.x - s.px) ** 2 + (b.y - s.py) ** 2;
    return db - da;
  });
  const invDet = 1 / (planeX * dirY - dirX * planeY);
  for (const sp of sorted) {
    const relX = sp.x - s.px;
    const relY = sp.y - s.py;
    const tx = invDet * (dirY * relX - dirX * relY);
    const ty = invDet * (-planeY * relX + planeX * relY); // depth
    if (ty < 0.2) continue;

    const screenX = (VIEW_W / 2) * (1 + tx / ty);
    const bob = Math.sin(s.time * 3 + sp.bob) * (VIEW_H / ty) * 0.03;
    const size = (VIEW_H / ty) * 0.9 * (sp.scale || 1);
    const hSize = size;
    const drawW = size;
    const x0 = Math.floor(screenX - drawW / 2);
    const x1 = Math.ceil(screenX + drawW / 2);
    const yTop = horizon + (VIEW_H / ty) * 0.5 - hSize + bob + sp.yOff * size;

    // Per-column slice draw for correct wall occlusion.
    const imgW = sp.img.width;
    let visL = VIEW_W;
    let visR = -1;
    for (let col = Math.max(0, x0); col < Math.min(VIEW_W, x1); col++) {
      if (zbuf[col] < ty) continue;
      let texX = Math.floor(((col - x0) / drawW) * imgW);
      if (sp.flipX) texX = imgW - 1 - texX;
      if (texX < 0 || texX >= imgW) continue;
      ctx.drawImage(sp.img, texX, 0, 1, sp.img.height, col, yTop, 1, hSize);
      if (col < visL) visL = col;
      if (col > visR) visR = col;
    }
    if (visR < visL) continue; // fully occluded or off-screen
    const visW = visR - visL + 1;

    // Cursed demons get a shield shimmer (only over the visible span).
    if (sp.cursed && sp.dying === 0 && visW > 2) {
      ctx.strokeStyle = `rgba(120,80,255,${0.35 + 0.25 * Math.sin(s.time * 5)})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(visL - 1.5, yTop - 2, visW + 3, hSize + 4);
    }
    // Shield-hit flash.
    if (sp.glow > 0) {
      ctx.fillStyle = `rgba(140,100,255,${sp.glow * 0.5})`;
      ctx.fillRect(visL, yTop, visW, hSize);
    }
    // Death fade.
    if (sp.dying > 0) {
      ctx.fillStyle = `rgba(120,0,0,${sp.dying * 0.5})`;
      ctx.fillRect(visL, yTop, visW, hSize);
    }

    // Subject label floats overhead — the email IS the monster.
    if (sp.dying === 0 && ty < MAX_DEPTH) {
      const fs = Math.max(5, Math.min(9, 26 / ty)) + (sp.boss ? 1 : 0);
      ctx.font = `${fs}px monospace`;
      ctx.textAlign = 'center';
      let label = sp.label.length > 26 ? `${sp.label.slice(0, 25)}…` : sp.label;
      if (sp.boss) label = `☠ ${label}`;
      const ly = yTop - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(label, screenX + 1, ly + 1);
      ctx.fillStyle = sp.boss ? '#f04040' : sp.cursed ? '#c090ff' : '#ffd040';
      ctx.fillText(label, screenX, ly);
    }
  }

  // Blood particles — tiny billboards, z is height 0..1 above the floor.
  for (const p of s.particles) {
    const relX = p.x - s.px;
    const relY = p.y - s.py;
    const tx = invDet * (dirY * relX - dirX * relY);
    const ty = invDet * (-planeY * relX + planeX * relY);
    if (ty < 0.2) continue;
    const screenX = (VIEW_W / 2) * (1 + tx / ty);
    const size = (VIEW_H / ty) * 0.08;
    const yTop = horizon + (VIEW_H / ty) * 0.5 - p.z * (VIEW_H / ty) * 0.9 - size;
    const x0 = Math.floor(screenX - size / 2);
    const x1 = Math.ceil(screenX + size / 2);
    for (let col = Math.max(0, x0); col < Math.min(VIEW_W, x1); col++) {
      if (zbuf[col] < ty) continue;
      const texX = Math.floor(((col - x0) / size) * p.img.width);
      if (texX < 0 || texX >= p.img.width) continue;
      ctx.drawImage(p.img, texX, 0, 1, p.img.height, col, yTop, 1, size);
    }
  }
}

// Hitscan: nearest live sprite within a small angular cone of view center.
export function pickTarget(
  s: Scene,
  maxAngle = 0.06,
  maxDist = 12,
): { idx: number; dist: number } | null {
  let best: { idx: number; dist: number } | null = null;
  s.sprites.forEach((sp, idx) => {
    if (sp.dying > 0) return;
    const dx = sp.x - s.px;
    const dy = sp.y - s.py;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist || dist < 0.3) return;
    const ang = Math.atan2(dy, dx) - s.dir;
    const wrapped = Math.atan2(Math.sin(ang), Math.cos(ang));
    if (Math.abs(wrapped) > maxAngle) return;
    // Line of sight check
    if (!lineOfSight(s, dist, wrapped)) return;
    if (!best || dist < best.dist) best = { idx, dist };
  });
  return best;
}

export function targetsInCone(
  s: Scene,
  halfAngle: number,
  maxDist: number,
): number[] {
  const out: number[] = [];
  s.sprites.forEach((sp, idx) => {
    if (sp.dying > 0) return;
    const dx = sp.x - s.px;
    const dy = sp.y - s.py;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist || dist < 0.3) return;
    const ang = Math.atan2(dy, dx) - s.dir;
    const wrapped = Math.atan2(Math.sin(ang), Math.cos(ang));
    if (Math.abs(wrapped) > halfAngle) return;
    if (!lineOfSight(s, dist, wrapped)) return;
    out.push(idx);
  });
  return out;
}

// Free-standing LoS between two points (enemy AI wake checks use this too).
export function hasLineOfSight(
  map: LevelMap,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  doorOpen: boolean,
): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(dist / 0.1);
  if (steps < 2) return true;
  const rdx = (bx - ax) / dist;
  const rdy = (by - ay) / dist;
  for (let i = 1; i < steps; i++) {
    const t = (i / steps) * dist;
    const c = cellAt(map, ax + rdx * t, ay + rdy * t);
    if (c === '#' || (c === 'D' && !doorOpen)) return false;
  }
  return true;
}

function lineOfSight(s: Scene, dist: number, ang: number): boolean {
  const rdx = Math.cos(s.dir + ang);
  const rdy = Math.sin(s.dir + ang);
  return hasLineOfSight(s.map, s.px, s.py, s.px + rdx * dist, s.py + rdy * dist, s.doorOpen);
}
