// One dungeon chamber per Gmail category. '#' wall, 'D' exit door, '.' floor.
// Deeper levels get bigger and more pillars — more places for demons to hide.
export interface LevelMap {
  grid: string[];
  w: number;
  h: number;
  spawn: { x: number; y: number };
  door: { x: number; y: number };
  spawnPoints: { x: number; y: number }[];
}

export function cellAt(map: LevelMap, x: number, y: number): string {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gx < 0 || gy < 0 || gx >= map.w || gy >= map.h) return '#';
  return map.grid[gy][gx];
}

export function isSolid(map: LevelMap, x: number, y: number, doorOpen: boolean): boolean {
  const c = cellAt(map, x, y);
  if (c === '#') return true;
  if (c === 'D') return !doorOpen;
  return false;
}

export function makeLevel(level: number): LevelMap {
  const w = 15;
  const h = 19 + Math.min(level, 2) * 2; // deeper rooms slightly longer
  const grid: string[][] = Array.from({ length: h }, () => Array<string>(w).fill('.'));

  for (let x = 0; x < w; x++) {
    grid[0][x] = '#';
    grid[h - 1][x] = '#';
  }
  for (let y = 0; y < h; y++) {
    grid[y][0] = '#';
    grid[y][w - 1] = '#';
  }

  // Exit door centered on the far wall.
  const doorX = Math.floor(w / 2);
  grid[0][doorX] = 'D';
  grid[0][doorX - 1] = '#';
  grid[0][doorX + 1] = '#';

  // Pillars — symmetric pairs, denser on deeper levels.
  const pillarRows = 2 + level;
  for (let i = 0; i < pillarRows; i++) {
    const py = 4 + Math.floor(((h - 8) / Math.max(pillarRows - 1, 1)) * i) || 4;
    for (const px of [3 + (i % 2), w - 4 - (i % 2)]) {
      grid[py][px] = '#';
      if (level > 1 && px + 1 < w - 1) grid[py][px + (px < w / 2 ? 1 : -1)] = '#';
    }
  }

  const spawn = { x: doorX + 0.5, y: h - 2.5 };

  // Enemy spawn points: scattered mid-room, away from spawn and door.
  const spawnPoints: { x: number; y: number }[] = [];
  for (let gy = 3; gy < h - 4; gy += 2) {
    for (let gx = 2; gx < w - 2; gx += 3) {
      if (grid[gy][gx] === '.' && Math.abs(gy - spawn.y) > 3) {
        spawnPoints.push({ x: gx + 0.5, y: gy + 0.5 });
      }
    }
  }

  return {
    grid: grid.map((r) => r.join('')),
    w,
    h,
    spawn,
    door: { x: doorX, y: 0 },
    spawnPoints,
  };
}
