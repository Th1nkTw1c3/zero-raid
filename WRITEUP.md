# ZERO RAID: your inbox is a dungeon. Clear it.

Zero Raid is a DOOM-style first-person shooter where every demon is a **real unread email** and every kill is a **real Gmail action**. It's not email-themed wallpaper: the only way to win is to actually hit inbox zero.

**How the real chore gets done:** sign in with Google (scopes `gmail.modify` + `gmail.send` only) and your Primary, Promotions, Updates and Social categories become dungeon levels full of demons. **Pistol = archive. Shotgun = trash (area blast). Chainsaw = star. Hellfire = a real threaded reply, then archive.** Violet "cursed" demons are emails that need an answer: bullets bounce off them, so you either reply for real or star them for later. The boss is your most important unread email.

**How to play:** WASD/mouse to move, click to fire, keys 1–4 swap weapons, hold TAB for the map. Clear a room to open its doors, then reach the exit.

Tech: hand-rolled raycaster in TypeScript (no game engine), Gmail REST API, sessions stored in an encrypted cookie with no database. Art is from Freedoom.

▶ Play: https://zero-raid.vercel.app · Code: https://github.com/Th1nkTw1c3/zero-raid

*Live Gmail sign-in is in Google's Testing mode, so voters: press **D** on the title screen for Demo mode (fake mail, real gameplay) unless you've been added as a test user.*
