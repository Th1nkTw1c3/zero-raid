// Decoration "things" — Freedoom lumps placed per room theme at level build.
// Torches/lamps/columns/gore/bodies/barrels. Falls away entirely when the
// Freedoom assets didn't load (procedural mode keeps an empty thing list).
import type { LevelMap, Room } from './map';

export interface ThingDef {
  lump: string; // freedoom sprite prefix (manifest.things key)
  solid: boolean;
  radius: number; // world tiles — for solidity + hit radius
  hang: boolean; // anchored to the ceiling instead of the floor
  light?: boolean; // bumps its room's light
  explosive?: boolean;
  scale: number; // SpriteDraw.scale (world height)
}

export const THING_DEFS: Record<string, ThingDef> = {
  tred: { lump: 'tred', solid: false, radius: 0.12, hang: false, light: true, scale: 0.55 },
  tgrn: { lump: 'tgrn', solid: false, radius: 0.12, hang: false, light: true, scale: 0.55 },
  tblu: { lump: 'tblu', solid: false, radius: 0.12, hang: false, light: true, scale: 0.55 },
  smrt: { lump: 'smrt', solid: false, radius: 0.1, hang: false, light: true, scale: 0.32 },
  smgt: { lump: 'smgt', solid: false, radius: 0.1, hang: false, light: true, scale: 0.32 },
  smbt: { lump: 'smbt', solid: false, radius: 0.1, hang: false, light: true, scale: 0.32 },
  elec: { lump: 'elec', solid: true, radius: 0.3, hang: false, light: true, scale: 1.3 },
  col1: { lump: 'col1', solid: true, radius: 0.3, hang: false, scale: 1.0 },
  col2: { lump: 'col2', solid: true, radius: 0.3, hang: false, scale: 1.0 },
  col3: { lump: 'col3', solid: true, radius: 0.3, hang: false, scale: 1.0 },
  col5: { lump: 'col5', solid: true, radius: 0.3, hang: false, scale: 1.0 },
  colu: { lump: 'colu', solid: true, radius: 0.22, hang: false, light: true, scale: 0.85 },
  tlmp: { lump: 'tlmp', solid: true, radius: 0.18, hang: false, light: true, scale: 0.9 },
  cbra: { lump: 'cbra', solid: true, radius: 0.12, hang: false, light: true, scale: 0.45 },
  cand: { lump: 'cand', solid: false, radius: 0.08, hang: false, light: true, scale: 0.3 },
  bar1: { lump: 'bar1', solid: true, radius: 0.28, hang: false, explosive: true, scale: 0.5 },
  gor1: { lump: 'gor1', solid: false, radius: 0.15, hang: true, scale: 0.6 },
  gor2: { lump: 'gor2', solid: false, radius: 0.15, hang: true, scale: 0.6 },
  gor3: { lump: 'gor3', solid: false, radius: 0.15, hang: true, scale: 0.6 },
  gor4: { lump: 'gor4', solid: false, radius: 0.15, hang: true, scale: 0.6 },
  gor5: { lump: 'gor5', solid: false, radius: 0.15, hang: true, scale: 0.6 },
  hdb1: { lump: 'hdb1', solid: false, radius: 0.12, hang: true, scale: 0.45 },
  hdb2: { lump: 'hdb2', solid: false, radius: 0.12, hang: true, scale: 0.45 },
  hdb3: { lump: 'hdb3', solid: false, radius: 0.12, hang: true, scale: 0.45 },
  hdb4: { lump: 'hdb4', solid: false, radius: 0.12, hang: true, scale: 0.45 },
  hdb5: { lump: 'hdb5', solid: false, radius: 0.12, hang: true, scale: 0.45 },
  hdb6: { lump: 'hdb6', solid: false, radius: 0.12, hang: true, scale: 0.45 },
  pob1: { lump: 'pob1', solid: false, radius: 0.15, hang: false, scale: 0.3 },
  pob2: { lump: 'pob2', solid: false, radius: 0.15, hang: false, scale: 0.3 },
  pol5: { lump: 'pol5', solid: false, radius: 0.15, hang: false, scale: 0.35 },
  pol1: { lump: 'pol1', solid: true, radius: 0.15, hang: false, scale: 0.8 },
  pol3: { lump: 'pol3', solid: true, radius: 0.15, hang: false, scale: 0.45 },
  tre1: { lump: 'tre1', solid: true, radius: 0.3, hang: false, scale: 1.2 },
  tre2: { lump: 'tre2', solid: true, radius: 0.3, hang: false, scale: 1.2 },
};

export interface Thing {
  def: ThingDef;
  x: number;
  y: number;
  roomId: number;
  hp: number;
  dead: boolean;
  boomAt: number; // >0 → chain-explode when reached (seconds)
  animOff: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Theme → decoration pools. Indices match makeThemes() order.
const POOLS: Record<number, { lump: string; n: [number, number]; edge?: boolean }[]> = {
  0: [ // wood
    { lump: 'bar1', n: [2, 3] },
    { lump: 'cand', n: [1, 2] },
    { lump: 'colu', n: [1, 1] },
  ],
  1: [ // metal
    { lump: 'elec', n: [1, 2] },
    { lump: 'tlmp', n: [1, 2] },
    { lump: 'bar1', n: [1, 2] },
  ],
  2: [ // marble
    { lump: 'col1', n: [1, 2] },
    { lump: 'col2', n: [1, 1] },
    { lump: 'cbra', n: [1, 2] },
    { lump: 'tred', n: [1, 2] },
  ],
  3: [ // brick
    { lump: 'smrt', n: [1, 2] },
    { lump: 'smgt', n: [0, 1] },
    { lump: 'smbt', n: [0, 1] },
    { lump: 'pob1', n: [1, 2] },
    { lump: 'pob2', n: [0, 1] },
  ],
  4: [ // hell
    { lump: 'gor1', n: [1, 2] },
    { lump: 'gor3', n: [0, 1] },
    { lump: 'hdb2', n: [0, 2] },
    { lump: 'pol1', n: [0, 1] },
    { lump: 'pol3', n: [0, 1] },
    { lump: 'tblu', n: [1, 2] },
    { lump: 'bar1', n: [0, 1] },
  ],
};

// Place decorations for the whole level. `have` = which lump prefixes the
// loader actually fetched; spawnX/spawnY excluded with a 1.5-tile radius.
export function placeThings(
  map: LevelMap,
  have: Set<string>,
  seed: number,
  spawnX: number,
  spawnY: number,
): Thing[] {
  const rng = mulberry32(seed * 2654435761 + 7);
  const things: Thing[] = [];
  const doorCells = new Set<number>();
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++)
      if (map.grid[y][x] === 'd' || map.grid[y][x] === 'D') doorCells.add(y * map.w + x);

  const clear = (x: number, y: number): boolean => {
    if (Math.hypot(x - spawnX, y - spawnY) < 1.5) return false;
    const cx = Math.floor(x), cy = Math.floor(y);
    for (const dc of doorCells) {
      const dcx = dc % map.w, dcy = (dc / map.w) | 0;
      if (Math.hypot(x - (dcx + 0.5), y - (dcy + 0.5)) < 1.5) return false;
    }
    if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return false;
    if (map.grid[cy][cx] !== '.') return false;
    for (const t of things) {
      if (Math.hypot(x - t.x, y - t.y) < t.def.radius + 0.6) return false;
    }
    return true;
  };

  const put = (room: Room, lump: string) => {
    const def = THING_DEFS[lump];
    if (!def || !have.has(lump)) return;
    for (let tries = 0; tries < 24; tries++) {
      const c = room.cells[Math.floor(rng() * room.cells.length)];
      const x = c.x + 0.2 + rng() * 0.6;
      const y = c.y + 0.2 + rng() * 0.6;
      if (!clear(x, y)) continue;
      things.push({
        def, x, y, roomId: room.id,
        hp: def.explosive ? 1 : 99,
        dead: false, boomAt: 0, animOff: rng() * 4,
      });
      return;
    }
  };

  for (const room of map.rooms) {
    const pool = POOLS[room.theme] || [];
    for (const p of pool) {
      const n = p.n[0] + Math.floor(rng() * (p.n[1] - p.n[0] + 1));
      for (let i = 0; i < n; i++) put(room, p.lump);
    }
    if (room.isSpawn) {
      // Two torches flanking the spawn room's first door.
      const d = room.doors[0] !== undefined ? map.doors[room.doors[0]] : null;
      if (d && have.has('tred')) {
        for (const s of [-0.8, 0.8]) {
          things.push({
            def: THING_DEFS.tred,
            x: d.x + 0.5 + (d.axis === 'h' ? s : 0),
            y: d.y + 0.5 + (d.axis === 'h' ? 0 : s),
            roomId: room.id,
            hp: 99, dead: false, boomAt: 0, animOff: rng() * 4,
          });
        }
      }
    }
  }
  return things;
}
