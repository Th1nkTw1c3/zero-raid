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
  mapX: number;
  mapY: number;
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
          mapX,
          mapY,
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
      mapX,
      mapY,
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
  additive?: boolean; // drawn with 'lighter' (projectile glows)
}

export interface DecalDraw {
  x: number;
  y: number;
  img: HTMLCanvasElement;
  size: number; // world units wide
  alpha: number;
}

export interface Scene extends SceneGeom {
  px: number;
  py: number;
  dir: number;
  wallTexs: HTMLCanvasElement[][]; // wall variants per theme
  trimTex: HTMLCanvasElement; // door-frame texture
  doorTex: HTMLCanvasElement;
  innerDoorTex: HTMLCanvasElement;
  floorTexs: Uint8ClampedArray[]; // 64x64 RGBA, index = map.cellFloor
  ceilTexs: Uint8ClampedArray[]; // index = map.cellTheme
  roomLight: Float32Array; // per-room sector light incl. flicker, indexed by room id
  sprites: SpriteDraw[];
  particles: ParticleDraw[];
  decals: DecalDraw[]; // flat blood pools on the floor
  time: number;
  light: number; // muzzle flash light 0..1
  pitch: number; // horizon shift in px (recoil)
}

const zbuf = new Float32Array(VIEW_W);
let frameBuf: ImageData | null = null;

// Sector light for the room owning a map cell.
function cellLight(s: Scene, mx: number, my: number): number {
  const rid = mx >= 0 && my >= 0 && mx < s.map.w && my < s.map.h ? s.map.cellRoom[my * s.map.w + mx] : -1;
  return rid >= 0 ? s.roomLight[rid] : 0.55;
}

// Doom colormap-style banded distance fade, lifted by muzzle light.
function bandShade(light: number, dist: number, muzzle: number): number {
  const sh = Math.min(1, Math.max(0.12, light - dist * 0.035));
  return Math.min(1, (Math.floor(sh * 16) / 16) + muzzle * 0.4);
}

export function render(ctx: CanvasRenderingContext2D, s: Scene): void {
  const dirX = Math.cos(s.dir);
  const dirY = Math.sin(s.dir);
  const planeScale = Math.tan(FOV / 2);
  const planeX = -dirY * planeScale;
  const planeY = dirX * planeScale;
  const horizon = Math.min(VIEW_H - 1, Math.max(1, VIEW_H / 2 + s.pitch));
  const light = Math.min(1, s.light);
  const mw = s.map.w;
  const mh = s.map.h;

  // Floor + ceiling casting into a per-pixel buffer.
  if (!frameBuf) frameBuf = new ImageData(VIEW_W, VIEW_H);
  const px32 = frameBuf.data;
  const rdLeftX = dirX - planeX;
  const rdLeftY = dirY - planeY;
  const rdRightX = dirX + planeX;
  const rdRightY = dirY + planeY;
  const yFloor0 = Math.ceil(horizon);
  const yCeil1 = Math.floor(horizon);
  for (let y = yFloor0; y < VIEW_H; y++) {
    const p = y - horizon + 0.001;
    const rowDist = (VIEW_H * 0.5) / p;
    let fx = s.px + rowDist * rdLeftX;
    let fy = s.py + rowDist * rdLeftY;
    const stepX = (rowDist * (rdRightX - rdLeftX)) / VIEW_W;
    const stepY = (rowDist * (rdRightY - rdLeftY)) / VIEW_W;
    for (let x = 0; x < VIEW_W; x++) {
      const cx = fx | 0;
      const cy = fy | 0;
      let sh = 0.3;
      let tex: Uint8ClampedArray | null = null;
      if (cx >= 0 && cy >= 0 && cx < mw && cy < mh) {
        const ci = cy * mw + cx;
        tex = s.floorTexs[s.map.cellFloor[ci]];
        sh = bandShade(cellLight(s, cx, cy), rowDist, light);
      }
      const o = (y * VIEW_W + x) * 4;
      if (tex) {
        const ti = (((fy * 64) & 63) * 64 + ((fx * 64) & 63)) * 4;
        px32[o] = tex[ti] * sh;
        px32[o + 1] = tex[ti + 1] * sh;
        px32[o + 2] = tex[ti + 2] * sh;
      } else {
        px32[o] = px32[o + 1] = px32[o + 2] = 8 * sh;
      }
      px32[o + 3] = 255;
      fx += stepX;
      fy += stepY;
    }
  }
  for (let y = 0; y < yCeil1; y++) {
    const p = horizon - y + 0.001;
    const rowDist = (VIEW_H * 0.5) / p;
    let fx = s.px + rowDist * rdLeftX;
    let fy = s.py + rowDist * rdLeftY;
    const stepX = (rowDist * (rdRightX - rdLeftX)) / VIEW_W;
    const stepY = (rowDist * (rdRightY - rdLeftY)) / VIEW_W;
    for (let x = 0; x < VIEW_W; x++) {
      const cx = fx | 0;
      const cy = fy | 0;
      let sh = 0.3;
      let tex: Uint8ClampedArray | null = null;
      if (cx >= 0 && cy >= 0 && cx < mw && cy < mh) {
        const ci = cy * mw + cx;
        tex = s.ceilTexs[s.map.cellTheme[ci]];
        sh = bandShade(cellLight(s, cx, cy), rowDist, light) * 0.8;
      }
      const o = (y * VIEW_W + x) * 4;
      if (tex) {
        const ti = (((fy * 64) & 63) * 64 + ((fx * 64) & 63)) * 4;
        px32[o] = tex[ti] * sh;
        px32[o + 1] = tex[ti + 1] * sh;
        px32[o + 2] = tex[ti + 2] * sh;
      } else {
        px32[o] = px32[o + 1] = px32[o + 2] = 6 * sh;
      }
      px32[o + 3] = 255;
      fx += stepX;
      fy += stepY;
    }
  }
  // Rows covered by neither (pitch edge cases) — black.
  ctx.putImageData(frameBuf, 0, 0);

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

    const ci = h.mapY * mw + h.mapX;
    let tex: HTMLCanvasElement;
    if (h.cell === '#') {
      const v = ci >= 0 && ci < mw * mh ? s.map.wallVariant[ci] : 0;
      if (v === 255) tex = s.trimTex;
      else {
        const vars = s.wallTexs[s.map.wallTheme[ci]] ?? s.wallTexs[1];
        tex = vars[v % vars.length];
      }
    } else tex = h.cell === 'd' ? s.innerDoorTex : s.doorTex;
    ctx.drawImage(tex, h.texX, 0, 1, 64, col, y0, 1, lineH);

    // Banded sector lighting; interior doors sit a touch darker.
    let sh = bandShade(cellLight(s, h.mapX, h.mapY), dist, light);
    if (h.side === 1) sh *= 0.82;
    let alpha = 1 - sh;
    if (h.cell === 'd') alpha = Math.min(0.9, alpha + 0.08);
    if (h.cell === 'D') {
      alpha = Math.min(0.9, alpha + 0.1 + 0.1 * Math.sin(s.time * 4));
    }
    if (alpha > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(col, y0, 1, lineH);
    }
    // Sliding doors: status strip across the slab top + bright leading edge.
    if (h.cell === 'd') {
      const open = s.doorOpen(h.doorId ?? -1);
      const fade = Math.max(0.15, sh);
      ctx.fillStyle = open > 0 ? `rgba(64,255,96,${fade})` : `rgba(255,64,64,${fade})`;
      ctx.fillRect(col, y0, 1, 3);
      if (h.doorFrac !== undefined && h.doorFrac - open < 0.02) {
        ctx.fillStyle = open > 0 ? '#80ff90' : '#ff6060';
        ctx.fillRect(col, y0, 1, lineH);
      }
    }
  }

  // Floor decals — blood pools squashed flat on the floor plane.
  for (const d of s.decals) {
    const relX = d.x - s.px;
    const relY = d.y - s.py;
    const invDet0 = 1 / (planeX * dirY - dirX * planeY);
    const tx = invDet0 * (dirY * relX - dirX * relY);
    const ty = invDet0 * (-planeY * relX + planeX * relY);
    if (ty < 0.2 || ty > MAX_DEPTH) continue;
    const screenX = (VIEW_W / 2) * (1 + tx / ty);
    const dw = (VIEW_H / ty) * d.size;
    const dh = dw * 0.3;
    const fy = horizon + (VIEW_H / ty) * 0.5;
    const x0 = Math.floor(screenX - dw / 2);
    const x1 = Math.ceil(screenX + dw / 2);
    ctx.globalAlpha = d.alpha;
    for (let col = Math.max(0, x0); col < Math.min(VIEW_W, x1); col++) {
      if (zbuf[col] < ty) continue;
      const texX = Math.floor(((col - x0) / dw) * d.img.width);
      if (texX < 0 || texX >= d.img.width) continue;
      ctx.drawImage(d.img, texX, 0, 1, d.img.height, col, fy - dh / 2, 1, dh);
    }
    ctx.globalAlpha = 1;
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
    const drawW = size * (sp.img.width / sp.img.height); // keep art aspect
    const x0 = Math.floor(screenX - drawW / 2);
    const x1 = Math.ceil(screenX + drawW / 2);
    const yTop = horizon + (VIEW_H / ty) * 0.5 - hSize + bob + sp.yOff * size;

    ctx.globalAlpha = sp.alpha;
    // Per-column slice draw for correct wall occlusion, shaded like walls.
    const spSh = (1 - bandShade(cellLight(s, Math.floor(sp.x), Math.floor(sp.y)), ty, light)) * 0.8;
    const imgW = sp.img.width;
    for (let col = Math.max(0, x0); col < Math.min(VIEW_W, x1); col++) {
      if (zbuf[col] < ty) continue;
      let texX = Math.floor(((col - x0) / drawW) * imgW);
      if (sp.flipX) texX = imgW - 1 - texX;
      if (texX < 0 || texX >= imgW) continue;
      ctx.drawImage(sp.img, texX, 0, 1, sp.img.height, col, yTop, 1, hSize);
      if (spSh > 0.03) {
        ctx.fillStyle = `rgba(0,0,0,${spSh})`;
        ctx.fillRect(col, yTop, 1, hSize);
      }
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
    const pW = size * (p.img.width / p.img.height);
    const yTop = horizon + (VIEW_H / ty) * 0.5 - p.z * (VIEW_H / ty) * 0.9 - size;
    const x0 = Math.floor(screenX - pW / 2);
    const x1 = Math.ceil(screenX + pW / 2);
    ctx.globalAlpha = p.alpha;
    if (p.additive) ctx.globalCompositeOperation = 'lighter';
    for (let col = Math.max(0, x0); col < Math.min(VIEW_W, x1); col++) {
      if (zbuf[col] < ty) continue;
      const texX = Math.floor(((col - x0) / pW) * p.img.width);
      if (texX < 0 || texX >= p.img.width) continue;
      ctx.drawImage(p.img, texX, 0, 1, p.img.height, col, yTop, 1, size);
    }
    ctx.globalCompositeOperation = 'source-over';
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
