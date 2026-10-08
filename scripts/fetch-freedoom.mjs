#!/usr/bin/env node
// Fetch Freedoom (BSD) art assets for Zero Raid.
// Usage: node scripts/fetch-freedoom.mjs
// Downloads sprites/faces/selected textures into public/freedoom/ + manifest.json.
// Texture/flat selection: decodes each candidate PNG, buckets by color,
// keeps the highest-contrast candidates per theme. Skips files that exist.

import { mkdirSync, existsSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'freedoom');
const TMP = join(tmpdir(), 'zr-freedoom-sel');
const CACHE = join(ROOT, 'scripts', '.freedoom-index.json');
const API = 'https://api.github.com/repos/freedoom/freedoom/contents';
const RAW = 'https://raw.githubusercontent.com/freedoom/freedoom/master';
// Use a token if available — the unauthenticated contents API caps at 60 req/h.
let TOKEN = process.env.GITHUB_TOKEN || '';
if (!TOKEN) {
  try {
    const { execSync } = await import('node:child_process');
    TOKEN = execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch { /* no gh — anonymous */ }
}
const UA = { 'User-Agent': 'zero-raid-asset-fetch', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };

// Sprite lump prefixes we need (lowercase filename prefixes in sprites/).
const SPRITE_PREFIXES = [
  'troo', 'skul', 'bspi', 'sarg', 'boss', 'cybr',
  'bal1', 'bal7', 'apls', 'apbx', 'misl',
  'puff', 'blud',
  'shtg', 'shtf', 'pisg', 'pisf', 'sawg',
];
const GRAPHIC_PREFIXES = ['stf'];

// Hand-picked theme lumps (see sheets/*.png review). Default mode uses this
// table verbatim; `--auto` falls back to the color-bucket heuristic instead.
const CURATED_TEXTURES = {
  wood:   { walls: ['crlwdl6', 'crlwdl6b', 'crwdl6', 'mywood'], trim: 'crwdh6', floor: 'floor0_1', ceil: 'ceil3_1', door: 'door9_1' },
  metal:  { walls: ['aqpanl05', 'aqpanl07', 'aqmetl08', 'aqpipe10'], trim: 'aqpanl06', floor: 'floor0_5', ceil: 'aqf028', door: 'door2_4' },
  marble: { walls: ['mwall1_1', 'mwall2_1', 'mwall4_1', 'mwall5_1'], trim: 'mwall3_1', floor: 'dem1_5', ceil: 'floor7_2', door: 'door15_1' },
  brick:  { walls: ['brick', 'brick2', 'brbrick', 'brbrick2'], trim: 'pbrick28', floor: 'floor5_1', ceil: 'flat5_7', door: 'door2_4' },
  hell:   { walls: ['hell5_1', 'hell8_1', 'dored', 'body_1', 'bodies'], trim: 'hell6_2', floor: 'blood1', ceil: 'rrock04', door: 'door11_1' },
  hazard: 'aqf018',
};
const AUTO_MODE = process.argv.includes('--auto');
const THEMES = ['wood', 'metal', 'marble', 'brick', 'hell'];

// Decoration lumps (torches, pillars, lamps, gore, bodies, barrels, trees).
const THING_PREFIXES = [
  'tred', 'tgrn', 'tblu', 'smrt', 'smgt', 'smbt',
  'elec', 'col1', 'col2', 'col3', 'col5', 'colu', 'tlmp',
  'cbra', 'cand', 'bar1', 'bexp',
  'gor1', 'gor2', 'gor3', 'gor4', 'gor5',
  'hdb1', 'hdb2', 'hdb3', 'hdb4', 'hdb5', 'hdb6',
  'pob1', 'pob2', 'pol5', 'pol1', 'pol3', 'tre1', 'tre2',
];

// Freedoom wavs (sounds/ dir, ds*.wav).
const SOUND_NAMES = [
  'dspistol', 'dsshotgn', 'dssawup', 'dssawidl', 'dssawful', 'dssawhit',
  'dsdoropn', 'dsdorcls', 'dsbgsit1', 'dsbgact', 'dsbgdth1', 'dsbgdth2', 'dsclaw',
  'dssgtsit', 'dssgtatk', 'dssgtdth', 'dsbrssit', 'dsbrsdth',
  'dsfirsht', 'dsfirxpl', 'dssklatk', 'dsskldth',
  'dsbspsit', 'dsbspdth', 'dsbspwlk', 'dsplasma',
  'dscybsit', 'dscybdth', 'dshoof', 'dsrlaunc', 'dsbarexp',
  'dsplpain', 'dsoof', 'dspunch', 'dsitemup', 'dsslop', 'dsnoway',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBuf(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// GitHub git-trees listing for a dir — no 1000-entry cap like contents API.
async function listDir(dir, ext = '.png') {
  const res = await fetch(`${API.replace('/contents', '/git/trees')}/master:${dir}`, { headers: UA });
  if (!res.ok) throw new Error(`listing ${dir}: ${res.status}`);
  const data = await res.json();
  if (data.truncated) console.warn(`warning: ${dir} listing truncated`);
  return (data.tree || [])
    .filter((it) => it.type === 'blob' && it.path.endsWith(ext))
    .map((it) => it.path);
}

async function loadIndex() {
  if (existsSync(CACHE)) {
    try { return JSON.parse(readFileSync(CACHE, 'utf8')); } catch { /* refetch */ }
  }
  const idx = {};
  for (const dir of ['sprites', 'graphics', 'patches', 'flats']) {
    idx[dir] = await listDir(dir);
    console.log(`index ${dir}: ${idx[dir].length} files`);
    await sleep(300);
  }
  writeFileSync(CACHE, JSON.stringify(idx));
  return idx;
}

// ---------------- minimal PNG decoder (8-bit, non-interlaced) ----------------
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let pos = 8;
  let ihdr = null;
  let plte = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        w: data.readUInt32BE(0), h: data.readUInt32BE(4),
        depth: data[8], color: data[9], interlace: data[12],
      };
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const { w, h, depth, color, interlace } = ihdr;
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported depth=${depth} interlace=${interlace}`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!ch) throw new Error(`color type ${color}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const img = Buffer.alloc(w * h * 4);
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = raw.subarray(p, p + stride);
    p += stride;
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (color === 3) {
        const i = cur[x] * 3;
        img[o] = plte[i]; img[o + 1] = plte[i + 1]; img[o + 2] = plte[i + 2];
        img[o + 3] = trns && cur[x] < trns.length ? trns[cur[x]] : 255;
      } else if (color === 2) {
        img[o] = cur[x * 3]; img[o + 1] = cur[x * 3 + 1]; img[o + 2] = cur[x * 3 + 2]; img[o + 3] = 255;
      } else if (color === 6) {
        img[o] = cur[x * 4]; img[o + 1] = cur[x * 4 + 1]; img[o + 2] = cur[x * 4 + 2]; img[o + 3] = cur[x * 4 + 3];
      } else if (color === 0) {
        img[o] = img[o + 1] = img[o + 2] = cur[x]; img[o + 3] = 255;
      } else { // 4
        img[o] = img[o + 1] = img[o + 2] = cur[x * 2]; img[o + 3] = cur[x * 2 + 1];
      }
    }
    prev.set(cur);
  }
  return { w, h, img };
}

// Average HSL + luminance stddev of opaque pixels.
function stats({ img }) {
  let n = 0, sr = 0, sg = 0, sb = 0, lumSum = 0, lumSq = 0, hueSum = 0, hueN = 0;
  for (let i = 0; i < img.length; i += 4) {
    if (img[i + 3] < 128) continue;
    const r = img[i] / 255, g = img[i + 1] / 255, b = img[i + 2] / 255;
    sr += r; sg += g; sb += b; n++;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += L; lumSq += L * L;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 0.05) {
      const d = mx - mn;
      let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hh *= 60; if (hh < 0) hh += 360;
      hueSum += hh; hueN++;
    }
  }
  if (!n) return null;
  const r = sr / n, g = sg / n, b = sb / n;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx - mn < 1e-6 ? 0 : (mx - mn) / (1 - Math.abs(2 * ((mx + mn) / 2) - 1) || 1);
  return {
    hue: hueN ? hueSum / hueN : 0,
    sat, light: (mx + mn) / 2,
    contrast: Math.sqrt(Math.max(0, lumSq / n - (lumSum / n) ** 2)),
    grayFrac: 1 - hueN / n,
  };
}

function themeOf({ hue, sat, light, grayFrac }) {
  if (sat < 0.15 || grayFrac > 0.8) return light > 0.2 && light < 0.6 ? 'metal' : null;
  if (hue >= 345 || hue <= 15) return light < 0.4 && sat > 0.4 ? 'hell' : sat > 0.3 ? 'brick' : null;
  if (hue <= 20) return sat > 0.3 ? 'brick' : 'wood';
  if (hue <= 40) return sat > 0.25 ? 'wood' : null;
  if (hue >= 45 && hue <= 65 && sat > 0.5) return 'hazard';
  if (hue >= 90 && hue <= 160) return 'marble';
  return null;
}

async function main() {
  mkdirSync(join(OUT, 'sprites'), { recursive: true });
  mkdirSync(join(OUT, 'graphics'), { recursive: true });
  mkdirSync(join(OUT, 'patches'), { recursive: true });
  mkdirSync(join(OUT, 'flats'), { recursive: true });
  mkdirSync(TMP, { recursive: true });
  const idx = await loadIndex();

  const manifest = { sprites: {}, graphics: [], textures: {}, flats: {}, hazard: null };
  let count = 0;
  const dl = async (dir, name) => {
    const dst = join(OUT, dir, name);
    if (existsSync(dst)) return;
    const buf = await fetchBuf(`${RAW}/${dir === 'sprites' ? 'sprites' : dir}/${name}`);
    writeFileSync(dst, buf);
    count++;
    await sleep(40);
  };

  // --- sprites + faces + things
  manifest.things = {};
  for (const name of idx.sprites) {
    if (SPRITE_PREFIXES.some((p) => name.startsWith(p))) {
      await dl('sprites', name);
      const key = SPRITE_PREFIXES.find((p) => name.startsWith(p));
      (manifest.sprites[key] ||= []).push(name);
    }
    if (THING_PREFIXES.some((p) => name.startsWith(p))) {
      await dl('sprites', name);
      const key = THING_PREFIXES.find((p) => name.startsWith(p));
      (manifest.things[key] ||= []).push(name);
    }
  }

  // --- sounds (ds*.wav)
  {
    const sndIdx = await listDir('sounds', '.wav');
    manifest.sounds = [];
    mkdirSync(join(OUT, 'sounds'), { recursive: true });
    for (const base of SOUND_NAMES) {
      const name = `${base}.wav`;
      if (!sndIdx.includes(name)) { console.log(`  sound missing: ${name}`); continue; }
      const dst = join(OUT, 'sounds', name);
      if (!existsSync(dst)) {
        writeFileSync(dst, await fetchBuf(`${RAW}/sounds/${name}`));
        count++;
        await sleep(40);
      }
      manifest.sounds.push(name);
    }
  }
  for (const name of idx.graphics) {
    if (GRAPHIC_PREFIXES.some((p) => name.startsWith(p))) {
      await dl('graphics', name);
      manifest.graphics.push(name);
    }
  }

  // --- textures: curated table by default; --auto re-runs the color heuristic
  if (!AUTO_MODE) {
    for (const theme of THEMES) {
      const t = CURATED_TEXTURES[theme];
      const walls = t.walls.map((n) => `${n}.png`);
      const trim = `${t.trim}.png`;
      manifest.textures[theme] = { walls, trim, floor: `${t.floor}.png`, ceil: `${t.ceil}.png`, door: `${t.door}.png` };
      for (const n of walls) await dl('patches', n);
      await dl('patches', trim);
      await dl('patches', `${t.door}.png`);
      await dl('flats', `${t.floor}.png`);
      await dl('flats', `${t.ceil}.png`);
    }
    manifest.hazard = `${CURATED_TEXTURES.hazard}.png`;
    await dl('flats', manifest.hazard);
  } else {
    // --- patches: fetch candidates, decode, bucket, keep top-3 per theme
    const patchCands = []; // {name, w, h, s}
    let tried = 0;
    // Stride-sample the whole (alphabetical) index so one family can't dominate.
    const pStep = Math.max(1, Math.floor(idx.patches.length / 400));
    for (let i = 0; i < idx.patches.length; i += pStep) {
      if (tried >= 400) break;
      const name = idx.patches[i];
      const tmp = join(TMP, name);
      try {
        if (!existsSync(tmp)) { writeFileSync(tmp, await fetchBuf(`${RAW}/patches/${name}`)); await sleep(30); }
        tried++;
        const png = decodePNG(readFileSync(tmp));
        if (png.w < 64 || png.w > 128 || png.h < 64 || png.h > 128) continue;
        const s = stats(png);
        if (!s) continue;
        patchCands.push({ name, w: png.w, h: png.h, s });
      } catch { /* skip undecodable */ }
    }
    console.log(`patches: ${tried} fetched for selection, ${patchCands.length} in size range`);
    for (const theme of THEMES) {
      const picks = patchCands
        .filter((c) => themeOf(c.s) === theme)
        .sort((a, b) => b.s.contrast - a.s.contrast)
        .slice(0, 3);
      manifest.textures[theme] = { walls: picks.map((p) => p.name), trim: null, floor: null, ceil: null };
      for (const p of picks) await dl('patches', p.name);
    }

    // --- flats: 64x64 only; floor = best contrast of bucket, ceil = darkest of bucket
    const flatCands = [];
    tried = 0;
    for (const name of idx.flats) {
      const tmp = join(TMP, `f-${name}`);
      try {
        if (!existsSync(tmp)) { writeFileSync(tmp, await fetchBuf(`${RAW}/flats/${name}`)); await sleep(30); }
        tried++;
        const png = decodePNG(readFileSync(tmp));
        if (png.w !== 64 || png.h !== 64) continue;
        const s = stats(png);
        if (!s) continue;
        flatCands.push({ name, s });
      } catch { /* skip */ }
    }
    console.log(`flats: ${tried} fetched, ${flatCands.length} at 64x64`);
    for (const theme of THEMES) {
      const bucket = flatCands.filter((c) => themeOf(c.s) === theme);
      const floor = bucket.sort((a, b) => b.s.contrast - a.s.contrast)[0];
      const ceil = bucket.sort((a, b) => a.s.light - b.s.light)[0];
      manifest.textures[theme].floor = floor?.name || null;
      manifest.textures[theme].ceil = ceil?.name || null;
      manifest.flats[theme] = bucket.map((b) => b.name).slice(0, 6);
      if (floor) await dl('flats', floor.name);
      if (ceil && ceil.name !== floor?.name) await dl('flats', ceil.name);
    }
    const hz = flatCands.filter((c) => themeOf(c.s) === 'hazard')
      .sort((a, b) => b.s.contrast - a.s.contrast)[0];
    if (hz) { manifest.hazard = hz.name; await dl('flats', hz.name); }
  }

  // --- prune texture files no longer referenced by the manifest
  {
    const { readdirSync } = await import('node:fs');
    const keepPatches = new Set();
    const keepFlats = new Set();
    for (const t of Object.values(manifest.textures)) {
      for (const n of t.walls) keepPatches.add(n);
      if (t.trim) keepPatches.add(t.trim);
      if (t.door) keepPatches.add(t.door);
      if (t.floor) keepFlats.add(t.floor);
      if (t.ceil) keepFlats.add(t.ceil);
    }
    if (manifest.hazard) keepFlats.add(manifest.hazard);
    for (const f of readdirSync(join(OUT, 'patches')))
      if (!keepPatches.has(f)) { rmSync(join(OUT, 'patches', f)); console.log(`  pruned patches/${f}`); }
    for (const f of readdirSync(join(OUT, 'flats')))
      if (!keepFlats.has(f)) { rmSync(join(OUT, 'flats', f)); console.log(`  pruned flats/${f}`); }
  }

  // --- license files
  for (const f of ['COPYING.adoc', 'CREDITS']) {
    const dst = join(OUT, f);
    if (!existsSync(dst)) writeFileSync(dst, await fetchBuf(`${RAW}/${f}`));
  }

  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

  // summary
  const { readdirSync, statSync } = await import('node:fs');
  let files = 0, bytes = 0;
  for (const dir of ['sprites', 'graphics', 'patches', 'flats']) {
    for (const f of readdirSync(join(OUT, dir))) {
      files++; bytes += statSync(join(OUT, dir, f)).size;
    }
  }
  console.log(`DONE: ${files} files, ${(bytes / 1e6).toFixed(2)} MB (+${count} downloaded this run)`);
  for (const t of THEMES) {
    const tx = manifest.textures[t];
    console.log(`  ${t}: walls=${tx.walls.join(',')} floor=${tx.floor} ceil=${tx.ceil}`);
  }
  console.log(`  hazard: ${manifest.hazard || 'none (procedural)'}`);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
