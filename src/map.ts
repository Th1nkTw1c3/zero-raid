// One dungeon per Gmail category: a seeded maze of rooms joined by sliding
// interior doors ('d'), a spawn room, a farthest-room boss lair, exit 'D'.
export interface Room {
  id: number;
  gx: number;
  gy: number;
  x0: number; // inclusive interior bounds (tile coords)
  y0: number;
  x1: number;
  y1: number;
  cells: { x: number; y: number }[];
  doors: number[]; // Door ids touching this room
  isSpawn: boolean;
  isBoss: boolean;
  dist: number; // BFS distance from spawn room
}

export interface Door {
  id: number;
  x: number;
  y: number;
  axis: 'h' | 'v'; // 'h' = slab runs along x (horizontal wall), 'v' along y
  rooms: [number, number];
}

export interface LevelMap {
  grid: string[];
  w: number;
  h: number;
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  rooms: Room[];
  doors: Door[];
  doorIndex: Map<string, number>; // `${gx},${gy}` -> door id for 'd' cells
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cellAt(map: LevelMap, x: number, y: number): string {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gx < 0 || gy < 0 || gx >= map.w || gy >= map.h) return '#';
  return map.grid[gy][gx];
}

export function doorIdAt(map: LevelMap, gx: number, gy: number): number {
  return map.doorIndex.get(`${gx},${gy}`) ?? -1;
}

export function roomAt(map: LevelMap, x: number, y: number): Room | null {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  for (const r of map.rooms) {
    if (gx >= r.x0 && gx <= r.x1 && gy >= r.y0 && gy <= r.y1) return r;
  }
  return null;
}

// doorState(id): 0 closed .. 1 open; solid while open < 0.8.
export function isSolid(
  map: LevelMap,
  x: number,
  y: number,
  doorState: (doorId: number) => number,
  exitOpen: boolean,
): boolean {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  const c = cellAt(map, x, y);
  if (c === '#') return true;
  if (c === 'D') return !exitOpen;
  if (c === 'd') {
    const id = doorIdAt(map, gx, gy);
    return id < 0 || doorState(id) < 0.8;
  }
  return false;
}

export function makeLevel(level: number, seed = level * 7919 + 13): LevelMap {
  const rng = mulberry32(seed);
  const cols = 3;
  const rows = level === 0 ? 2 : 3;
  const w = cols * 8 + 1;
  const h = rows * 8 + 1;
  const grid: string[][] = Array.from({ length: h }, () => Array<string>(w).fill('#'));

  const rooms: Room[] = [];
  const roomId = (gx: number, gy: number) => gy * cols + gx;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x0 = gx * 8 + 1;
      const y0 = gy * 8 + 1;
      const cells: { x: number; y: number }[] = [];
      for (let y = y0; y <= y0 + 6; y++) {
        for (let x = x0; x <= x0 + 6; x++) {
          grid[y][x] = '.';
          cells.push({ x, y });
        }
      }
      rooms.push({
        id: roomId(gx, gy),
        gx,
        gy,
        x0,
        y0,
        x1: x0 + 6,
        y1: y0 + 6,
        cells,
        doors: [],
        isSpawn: gx === 0 && gy === rows - 1,
        isBoss: false,
        dist: -1,
      });
    }
  }

  // Randomized-DFS spanning tree over the room grid.
  const spawnRoom = roomId(0, rows - 1);
  const connected = new Map<string, [number, number]>(); // "a>b" key
  const adj = (id: number) => {
    const gx = id % cols;
    const gy = Math.floor(id / cols);
    const out: number[] = [];
    if (gx > 0) out.push(roomId(gx - 1, gy));
    if (gx < cols - 1) out.push(roomId(gx + 1, gy));
    if (gy > 0) out.push(roomId(gx, gy - 1));
    if (gy < rows - 1) out.push(roomId(gx, gy + 1));
    return out;
  };
  const key = (a: number, b: number) => `${Math.min(a, b)}>${Math.max(a, b)}`;
  const visited = new Set<number>([spawnRoom]);
  const stack = [spawnRoom];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const next = adj(cur).filter((n) => !visited.has(n));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const n = next[Math.floor(rng() * next.length)];
    connected.set(key(cur, n), [cur, n]);
    visited.add(n);
    stack.push(n);
  }
  // Extra loop connections.
  const extra = 1 + (level >= 2 ? 1 : 0);
  const unconnected: [number, number][] = [];
  for (const r of rooms) {
    for (const n of adj(r.id)) {
      if (n > r.id && !connected.has(key(r.id, n))) unconnected.push([r.id, n]);
    }
  }
  for (let i = 0; i < extra && unconnected.length; i++) {
    const j = Math.floor(rng() * unconnected.length);
    const [a, b] = unconnected.splice(j, 1)[0];
    connected.set(key(a, b), [a, b]);
  }

  // Doorways at shared-wall centers.
  const doors: Door[] = [];
  const doorIndex = new Map<string, number>();
  for (const [a, b] of connected.values()) {
    const ra = rooms[a];
    const rb = rooms[b];
    let dx: number, dy: number, axis: 'h' | 'v';
    if (ra.gy === rb.gy) {
      // side by side — vertical wall runs along y
      dx = Math.min(ra.gx, rb.gx) * 8 + 8;
      dy = ra.gy * 8 + 4;
      axis = 'v';
    } else {
      dx = ra.gx * 8 + 4;
      dy = Math.min(ra.gy, rb.gy) * 8 + 8;
      axis = 'h';
    }
    const id = doors.length;
    grid[dy][dx] = 'd';
    doorIndex.set(`${dx},${dy}`, id);
    doors.push({ id, x: dx, y: dy, axis, rooms: [a, b] });
    ra.doors.push(id);
    rb.doors.push(id);
  }

  // BFS distances from the spawn room.
  const link = new Map<number, number[]>();
  for (const [a, b] of connected.values()) {
    (link.get(a) || link.set(a, []).get(a)!).push(b);
    (link.get(b) || link.set(b, []).get(b)!).push(a);
  }
  const bfs = [spawnRoom];
  rooms[spawnRoom].dist = 0;
  while (bfs.length) {
    const cur = bfs.shift()!;
    for (const n of link.get(cur) || []) {
      if (rooms[n].dist < 0) {
        rooms[n].dist = rooms[cur].dist + 1;
        bfs.push(n);
      }
    }
  }
  const bossRoom = rooms.reduce((m, r) => (r.dist > m.dist ? r : m), rooms[0]);
  bossRoom.isBoss = true;

  // Interior pillars on deeper levels — never near a doorway.
  if (level >= 1) {
    for (const r of rooms) {
      const n = Math.floor(rng() * 3);
      const doorCells = r.doors.map((d) => doors[d]);
      for (let i = 0, tries = 0; i < n && tries < 20; tries++) {
        const px = r.x0 + 1 + Math.floor(rng() * 5);
        const py = r.y0 + 1 + Math.floor(rng() * 5);
        if (grid[py][px] !== '.') continue;
        if (
          doorCells.some((d) => Math.abs(d.x - px) + Math.abs(d.y - py) < 2) ||
          (Math.abs(px - (r.x0 + 3)) < 1 && Math.abs(py - (r.y0 + 3)) < 1 && r.isSpawn)
        )
          continue;
        grid[py][px] = '#';
        i++;
      }
    }
  }

  // Exit: boss-room outer wall center farthest from its doors.
  const exit = { x: 0, y: 0 };
  {
    const r = bossRoom;
    const sides = [
      { x: r.x0 + 3, y: r.y0 - 1, boundary: r.y0 === 1 },
      { x: r.x0 + 3, y: r.y1 + 1, boundary: r.y1 === h - 2 },
      { x: r.x0 - 1, y: r.y0 + 3, boundary: r.x0 === 1 },
      { x: r.x1 + 1, y: r.y0 + 3, boundary: r.x1 === w - 2 },
    ];
    let best = sides[0];
    let bestScore = -1;
    for (const s of sides) {
      if (grid[s.y][s.x] !== '#') continue;
      const dmin = Math.min(
        ...r.doors.map((d) => Math.abs(doors[d].x - s.x) + Math.abs(doors[d].y - s.y)),
        99,
      );
      const score = (s.boundary ? 100 : 0) + dmin;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    grid[best.y][best.x] = 'D';
    exit.x = best.x;
    exit.y = best.y;
  }

  const sr = rooms[spawnRoom];
  return {
    grid: grid.map((r) => r.join('')),
    w,
    h,
    spawn: { x: sr.x0 + 3.5, y: sr.y0 + 3.5 },
    exit,
    rooms,
    doors,
    doorIndex,
  };
}
