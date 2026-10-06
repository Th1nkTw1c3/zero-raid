// 2.5D raycaster: textured walls, thin sliding doors, billboard sprites with
// per-column z-buffer, floating subject labels. Chunky low res, CSS-scaled.
import { cellAt, doorIdAt } from './map';
import type { LevelMap } from './map';

export const VIEW_W = 320;
export const VIEW_H = 160;
const FOV = Math.PI / 3; // 60°
const MAX_DEPTH = 20;

// Geometry-only view of a scene — shared by rendering and gameplay rays.
export interface SceneGeom {
  map: LevelMap;
  exitOpen: boolean;
  doorOpen: (doorId: number) => number; // 0 closed .. 1 open
}

export interface RayHit {
  dist: number; // distance along the ray
  cell: string;
  side: number;
  hx: number;
  hy: number;
  texX: number;
  doorId?: number;
  doorFrac?: number; // position along the slab, 0..1
}

// DDA raycast. Thin 'd' slabs sit at the cell-center plane and let the ray
// through where the door has already slid past (frac < open).
export function castRay(
  g: SceneGeom,
  ox: number,
  oy: number,
  rdx: number,
  rdy: number,
): RayHit {
  let mapX = Math.floor(ox);
  let mapY = Math.floor(oy);
  const deltaX = Math.abs(1 / (rdx || 1e-9));
  const deltaY = Math.abs(1 / (rdy || 1e-9));
  let stepX: number, stepY: number, sideX: number, sideY: number;
  if (rdx < 0) {
    stepX = -1;
    sideX = (ox - mapX) * deltaX;
  } else {
    stepX = 1;
    sideX = (mapX + 1 - ox) * deltaX;
  }
  if (rdy < 0) {
    stepY = -1;
    sideY = (oy - mapY) * deltaY;
  } else {
    stepY = 1;
    sideY = (mapY + 1 - oy) * deltaY;
  }

  let side = 0;
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
    if (mapX < 0 || mapY < 0 || mapX >= g.map.w || mapY >= g.map.h) {
      const t = side === 0 ? sideX - deltaX : sideY - deltaY;
      return hit('#', t);
    }
    const cell = cellAt(g.map, mapX, mapY);
    if (cell === '#') {
      const t = side === 0 ? sideX - deltaX : sideY - deltaY;
      return hit(cell, t);
    }
    if (cell === 'D') {
      if (!g.exitOpen) {
        const t = side === 0 ? sideX - deltaX : sideY - deltaY;
        return hit(cell, t);
      }
      continue;
    }
    if (cell === 'd') {
      const id = doorIdAt(g.map, mapX, mapY);
      const open = id >= 0 ? g.doorOpen(id) : 0;
      // Slab plane at the cell center, perpendicular to the step axis.
      const tc = side === 0 ? sideX - deltaX / 2 : sideY - deltaY / 2;
      const hxc = ox + rdx * tc;
      const hyc = oy + rdy * tc;
      const f = (side === 0 ? hyc : hxc) - (side === 0 ? mapY : mapX);
      if (open < 1 && f >= 0 && f < 1 && f >= open) {
        return {
          dist: tc,
          cell: 'd',
          side,
          hx: hxc,
          hy: hyc,
          texX: Math.min(63, Math.floor((f - open) * 64)),
          doorId: id,
          doorFrac: f,
        };
      }
      continue; // ray slips through the opened gap
    }
  }
  return hit('#', MAX_DEPTH);

  function hit(cell: string, t: number): RayHit {
    const hx = ox + rdx * t;
    const hy = oy + rdy * t;
    const wallX = (side === 0 ? hy : hx) - Math.floor(side === 0 ? hy : hx);
    return {
      dist: t,
      cell,
      side,
      hx,
      hy,
      texX: Math.min(63, Math.floor(wallX * 64)),
    };
  }
}

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
  scale: number;
  yOff: number;
  alpha: number; // phantoms flicker
}

export interface ParticleDraw {
  x: number;
  y: number;
  z: number; // height 0..1
  img: HTMLCanvasElement;
  size: number; // world-space fraction, ~0.08 default
  alpha: number;
}

export interface Scene extends SceneGeom {
  px: number;
  py: number;
  dir: number;
  wallTex: HTMLCanvasElement;
  doorTex: HTMLCanvasElement;
  innerDoorTex: HTMLCanvasElement;
  sprites: SpriteDraw[];
  particles: ParticleDraw[];
  time: number;
  light: number; // muzzle flash light 0..1
  pitch: number; // horizon shift in px (recoil)
}

const zbuf = new Float32Array(VIEW_W);

function shade(dist: number): number {
  return Math.min(0.6, dist * 0.045);
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

export function render(ctx: CanvasRenderingContext2D, s: Scene): void {
  const dirX = Math.cos(s.dir);
  const dirY = Math.sin(s.dir);
  const planeScale = Math.tan(FOV / 2);
  const planeX = -dirY * planeScale;
  const planeY = dirX * planeScale;
  const horizon = VIEW_H / 2 + s.pitch;
  const light = Math.min(1, s.light);

  // Ceiling — doom-dark gradient, warmed by muzzle light.
  const ceil = ctx.createLinearGradient(0, 0, 0, horizon);
  ceil.addColorStop(0, lerpColor('#0a0a12', '#403028', light * 0.3));
  ceil.addColorStop(1, lerpColor('#1c1c28', '#403028', light * 0.3));
  ctx.fillStyle = ceil;
  ctx.fillRect(0, 0, VIEW_W, Math.max(0, horizon));
  // Floor.
  const floor = ctx.createLinearGradient(0, horizon, 0, VIEW_H);
  floor.addColorStop(0, lerpColor('#38302a', '#403028', light * 0.3));
  floor.addColorStop(1, lerpColor('#181410', '#403028', light * 0.3));
  ctx.fillStyle = floor;
  ctx.fillRect(0, Math.max(0, horizon), VIEW_W, VIEW_H - horizon);

  // Walls — one ray per column.
  for (let col = 0; col < VIEW_W; col++) {
    const camX = (2 * col) / VIEW_W - 1;
    const rdx = dirX + planeX * camX;
    const rdy = dirY + planeY * camX;
    const h = castRay(s, s.px, s.py, rdx, rdy);
    const dist = Math.max(0.05, h.dist * (rdx * dirX + rdy * dirY)); // kill fisheye
    zbuf[col] = dist;
    const lineH = VIEW_H / dist;
    const y0 = horizon - lineH / 2;

    const tex = h.cell === '#' ? s.wallTex : h.cell === 'd' ? s.innerDoorTex : s.doorTex;
    ctx.drawImage(tex, h.texX, 0, 1, 64, col, y0, 1, lineH);

    // Distance + side shading; interior doors sit a touch darker.
    let alpha = shade(dist);
    if (h.side === 1) alpha = Math.min(0.85, alpha + 0.15);
    if (h.cell === 'd') alpha = Math.min(0.9, alpha + 0.08);
    if (h.cell === 'D') {
      alpha = Math.min(0.9, alpha + 0.1 + 0.1 * Math.sin(s.time * 4));
    }
    alpha = Math.max(0, alpha - light * 0.45);
    if (alpha > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(col, y0, 1, lineH);
    }
    // Sliding doors: status strip across the slab top + bright leading edge.
    if (h.cell === 'd') {
      const open = s.doorOpen(h.doorId ?? -1);
      const fade = Math.max(0.15, 1 - shade(dist) * 1.6);
      ctx.fillStyle = open > 0 ? `rgba(64,255,96,${fade})` : `rgba(255,64,64,${fade})`;
      ctx.fillRect(col, y0, 1, 3);
      if (h.doorFrac !== undefined && h.doorFrac - open < 0.02) {
        ctx.fillStyle = open > 0 ? '#80ff90' : '#ff6060';
        ctx.fillRect(col, y0, 1, lineH);
      }
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

    ctx.globalAlpha = sp.alpha;
    // Per-column slice draw for correct wall occlusion.
    const imgW = sp.img.width;
    for (let col = Math.max(0, x0); col < Math.min(VIEW_W, x1); col++) {
      if (zbuf[col] < ty) continue;
      let texX = Math.floor(((col - x0) / drawW) * imgW);
      if (sp.flipX) texX = imgW - 1 - texX;
      if (texX < 0 || texX >= imgW) continue;
      ctx.drawImage(sp.img, texX, 0, 1, sp.img.height, col, yTop, 1, hSize);
    }

    // Cursed demons get a shield shimmer.
    if (sp.cursed && sp.dying === 0) {
      ctx.strokeStyle = `rgba(120,80,255,${0.35 + 0.25 * Math.sin(s.time * 5)})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 - 2, yTop - 2, drawW + 4, hSize + 4);
    }
    if (sp.glow > 0) {
      ctx.fillStyle = `rgba(140,100,255,${sp.glow * 0.5})`;
      ctx.fillRect(x0, yTop, drawW, hSize);
    }
    if (sp.dying > 0) {
      ctx.fillStyle = `rgba(120,0,0,${sp.dying * 0.5})`;
      ctx.fillRect(x0, yTop, drawW, hSize);
    }
    ctx.globalAlpha = 1;

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

  // Particles — tiny billboards, z is height 0..1 above the floor.
  for (const p of s.particles) {
    const relX = p.x - s.px;
    const relY = p.y - s.py;
    const tx = invDet * (dirY * relX - dirX * relY);
    const ty = invDet * (-planeY * relX + planeX * relY);
    if (ty < 0.2) continue;
    const screenX = (VIEW_W / 2) * (1 + tx / ty);
    const size = (VIEW_H / ty) * (p.size || 0.08);
    const yTop = horizon + (VIEW_H / ty) * 0.5 - p.z * (VIEW_H / ty) * 0.9 - size;
    const x0 = Math.floor(screenX - size / 2);
    const x1 = Math.ceil(screenX + size / 2);
    ctx.globalAlpha = p.alpha;
    for (let col = Math.max(0, x0); col < Math.min(VIEW_W, x1); col++) {
      if (zbuf[col] < ty) continue;
      const texX = Math.floor(((col - x0) / size) * p.img.width);
      if (texX < 0 || texX >= p.img.width) continue;
      ctx.drawImage(p.img, texX, 0, 1, p.img.height, col, yTop, 1, size);
    }
    ctx.globalAlpha = 1;
  }
}

// Hitscan: nearest live sprite within a small angular cone of `angle`.
export function pickTargetAt(
  s: Scene,
  angle: number,
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
    const ang = Math.atan2(dy, dx) - angle;
    const wrapped = Math.atan2(Math.sin(ang), Math.cos(ang));
    if (Math.abs(wrapped) > maxAngle) return;
    if (!lineOfSight(s, angle, dist, wrapped)) return;
    if (!best || dist < best.dist) best = { idx, dist };
  });
  return best;
}

export function pickTarget(
  s: Scene,
  maxAngle = 0.06,
  maxDist = 12,
): { idx: number; dist: number } | null {
  return pickTargetAt(s, s.dir, maxAngle, maxDist);
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
    if (!lineOfSight(s, s.dir, dist, wrapped)) return;
    out.push(idx);
  });
  return out;
}

// Free-standing LoS between two points — 'd' blocks unless mostly open.
export function hasLineOfSight(
  map: LevelMap,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  geom: SceneGeom,
): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(dist / 0.1);
  if (steps < 2) return true;
  const rdx = (bx - ax) / dist;
  const rdy = (by - ay) / dist;
  for (let i = 1; i < steps; i++) {
    const t = (i / steps) * dist;
    const gx = Math.floor(ax + rdx * t);
    const gy = Math.floor(ay + rdy * t);
    const c = cellAt(map, ax + rdx * t, ay + rdy * t);
    if (c === '#') return false;
    if (c === 'D' && !geom.exitOpen) return false;
    if (c === 'd') {
      const id = doorIdAt(map, gx, gy);
      if (id < 0 || geom.doorOpen(id) < 0.8) return false;
    }
  }
  return true;
}

function lineOfSight(s: Scene, angle: number, dist: number, off: number): boolean {
  const rdx = Math.cos(angle + off);
  const rdy = Math.sin(angle + off);
  return hasLineOfSight(s.map, s.px, s.py, s.px + rdx * dist, s.py + rdy * dist, s);
}
