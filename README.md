# ZERO RAID

**Your inbox is a dungeon. Clear it.**

A DOOM-style (1993) first-person email triage game built for Hackyard Yard #4.
Every demon is a **real unread email** in your Gmail. Every kill is a **real
mutation** — archive, trash, star, or a threaded reply. This is not
email-themed wallpaper: the only way to win is to actually hit inbox zero.

## How it plays

Your Gmail categories are dungeon levels: **Primary → Promotions → Updates →
Social**. Unread mail spawns as demons with the subject line floating overhead.
A room's exit door only grinds open when that category has **zero unread**.

| Control | Weapon | Real Gmail action |
|---|---|---|
| `WASD` / arrows | — | Move / turn (click for mouse-look) |
| `1` + click | Pistol | **Archive** (remove INBOX+UNREAD) |
| `2` + click (or right-click) | Shotgun | **Trash** — cone AoE |
| `3` + hold click | Chainsaw | **Star** — works on anything, incl. cursed |
| `4` or `E` | Hellfire spell | **Reply** — sends a real Gmail reply + archives |

**Violet "cursed" demons** are mail that smells like it needs an answer
(`Re:`, `?`, `RSVP`, `review`, `confirm`, …). Bullets spark off their shield —
you either cast Hellfire and *actually reply*, or chainsaw-star it to defer.
Deeper levels spawn more cursed demons, faster. That tension is the game.

**HUD** (bottom status bar): `STREAK` = consecutive successful actions without
getting mauled (it is your health — a demon touch resets it), `APM` = actions
per minute (your ammo), `SCORE`, weapon, room. Top-right mini-map shows room
clear state.

## Run it

```bash
npm install
cp .env.example .env   # fill in Google OAuth creds (below)
npm run dev            # API on :8787, game on http://localhost:5173
```

### Google OAuth setup (~5 min)

1. Google Cloud Console → create project → enable **Gmail API**.
2. OAuth consent screen → External → add scope `gmail.modify` + `gmail.send`,
   add yourself as test user.
3. Credentials → OAuth client ID (Web) → redirect URIs:
   `http://localhost:5173/api/callback` and `https://<your-app>.vercel.app/api/callback`.
4. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` in `.env`.

### No Google creds? Demo mode

If env vars are missing the server runs **demo mode**: seeded fake mail, all
actions simulated server-side, clearly labeled `DEMO MODE` in the HUD. With
creds configured you can still force it via the `D` key on the title screen or
`DEMO_MODE=1`.

## Deploy (Vercel)

```bash
npx vercel        # framework preset: Vite; api/*.ts become serverless fns
npx vercel env add GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SESSION_SECRET
npx vercel --prod
```

The `api/` handlers are plain Node `(req, res)` functions — they deploy as
Vercel serverless functions unchanged, and `server/dev.ts` mounts them on
Express for local dev. Sessions live in an AES-256-GCM encrypted cookie; no
database.

## Demo script (for the video)

1. Title screen → "LIVE: you@gmail.com" → Enter.
2. **Level 1 PRIMARY**: pistol-archive a couple of imps (watch Gmail: the
   thread leaves the inbox), shotgun-trash a cluster, chainsaw-star one.
3. Violet demon → press `4`, type a one-liner, `Ctrl+Enter` — the reply is
   really sent (check the thread in Gmail: replied + archived).
4. Room hits zero → door opens → walk through → **Level 2 PROMOTIONS** with
   fresh demons. Mini-map shows `PRIM CLR`.
5. Hard cut to Gmail: unread count visibly dropped.

## Tech

- Front end: Vite + TypeScript + a hand-rolled raycaster on `<canvas>`
  (textured DDA walls, billboard sprites with per-column z-buffer, procedural
  pixel art + WebAudio SFX — zero assets, ~24 KB gzipped).
- Back end: 7 tiny Node handlers (`api/`), Gmail REST API via `fetch`
  (no googleapis dependency), encrypted-cookie sessions.
- Scopes: `gmail.modify`, `gmail.send`. Nothing else.

## License

MIT — see LICENSE.
