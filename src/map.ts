// One dungeon per Gmail category: spawn alcove → corridor with side alcoves
// (three ambush zones) → boss arena → exit door in the top wall.
export interface LevelMap {
  grid: string[];
  w: number;
  h: number;
  spawn: { x: number; y: number };
  door: { x: number; y: number };
  spawnPoints: { x: number; y: number }[];
  // Ambush zones along the corridor — crossing below y (moving up) triggers.
  zones: { y: number; spawnPoints: { x: number; y: number }[] }[];
  arena: { y: number; center: { x: number; y: number }; spawnPoints: { x: number; y: number }[] };
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
  const corridorLen = 7 + level * 2;
  const arenaDepth = 7;
  const arenaTop = 1;
  const corridorTop = arenaTop + arenaDepth;
  const corridorEnd = corridorTop + corridorLen; // exclusive; spawn alcove follows
  const h = corridorEnd + 3 + 1; // + spawn alcove depth + bottom wall

  const grid: string[][] = Array.from({ length: h }, () => Array<string>(w).fill('#'));

  // Boss arena: 11 wide × 7 deep just below the top wall.
  for (let y = arenaTop; y < arenaTop + arenaDepth; y++) {
    for (let x = 2; x <= 12; x++) grid[y][x] = '.';
  }
  // Arena pillars on deeper levels.
  if (level >= 1) {
    const midY = arenaTop + Math.floor(arenaDepth / 2);
    grid[midY][4] = '#';
    grid[midY][10] = '#';
  }

  // Corridor: 5 wide, columns 5..9.
  for (let y = corridorTop; y < corridorEnd; y++) {
    for (let x = 5; x <= 9; x++) grid[y][x] = '.';
  }

  // Alternating side alcoves: 3 wide × 2 deep pockets every 3 rows.
  for (let r = corridorTop + 1, side = 0; r + 1 < corridorEnd; r += 3, side++) {
    const xs = side % 2 === 0 ? [2, 3, 4] : [10, 11, 12];
    for (const x of xs) {
      grid[r][x] = '.';
      grid[r + 1][x] = '.';
    }
  }

  // Spawn alcove: 5 wide × 3 deep at the bottom.
  for (let y = corridorEnd; y < corridorEnd + 3; y++) {
    for (let x = 5; x <= 9; x++) grid[y][x] = '.';
  }

  // Exit door centered on the top wall.
  const doorX = 7;
  grid[0][doorX] = 'D';

  const spawn = { x: 7.5, y: corridorEnd + 1.5 };

  // Ambush zones at 25/50/75% along the corridor (from the spawn side).
  const zones: LevelMap['zones'] = [];
  for (let k = 0; k < 3; k++) {
    const ty = corridorEnd - corridorLen * (0.25 * (k + 1)) + 0.5;
    const spawnPoints: { x: number; y: number }[] = [];
    for (let gy = Math.floor(ty) - 1; gy >= Math.floor(ty) - 4 && gy > 0; gy--) {
      for (let gx = 1; gx < w - 1; gx++) {
        if (grid[gy][gx] === '.') spawnPoints.push({ x: gx + 0.5, y: gy + 0.5 });
      }
    }
    zones.push({ y: ty, spawnPoints });
  }

  // Boss arena trigger + spawn ring.
  const arenaCenter = { x: 7.5, y: arenaTop + arenaDepth / 2 - 0.5 };
  const arena: LevelMap['arena'] = {
    y: arenaTop + arenaDepth - 0.5,
    center: arenaCenter,
    spawnPoints: [],
  };
  for (let gy = arenaTop; gy < arenaTop + arenaDepth; gy++) {
    for (let gx = 2; gx <= 12; gx++) {
      if (
        grid[gy][gx] === '.' &&
        Math.hypot(gx + 0.5 - arenaCenter.x, gy + 0.5 - arenaCenter.y) >= 2
      ) {
        arena.spawnPoints.push({ x: gx + 0.5, y: gy + 0.5 });
      }
    }
  }

  const spawnPoints = [...zones.flatMap((z) => z.spawnPoints), ...arena.spawnPoints];

  return {
    grid: grid.map((r) => r.join('')),
    w,
    h,
    spawn,
    door: { x: doorX, y: 0 },
    spawnPoints,
    zones,
    arena,
  };
}
