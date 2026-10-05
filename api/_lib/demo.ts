// Demo mode: seeded fake mail, mutated server-side in memory.
// Only active when OAuth is not configured or DEMO_MODE=1. Clearly labeled via /api/status.
import crypto from 'node:crypto';
import { flagNeedsReply, type UnreadMessage } from './gmail';

interface DemoState {
  id: string;
  rooms: Record<string, UnreadMessage[]>;
}

const states = new Map<string, DemoState>();

const DEMO_SUBJECTS: Record<string, { subject: string; from: string }[]> = {
  primary: [
    { subject: 'Re: Hackyard demo slot', from: 'organizer@hackyard.dev' },
    { subject: 'Invoice #1042 attached', from: 'billing@saasvendor.io' },
    { subject: '1:1 notes from Tuesday', from: 'manager@work.com' },
    { subject: 'Flight confirmation SFO-JFK', from: 'noreply@airline.com' },
    { subject: 'Can you review this PR?', from: 'teammate@work.com' },
    { subject: 'Lunch Thursday?', from: 'friend@gmail.com' },
  ],
  promotions: [
    { subject: '50% OFF — this weekend only!', from: 'deals@megamart.com' },
    { subject: 'Your cart misses you', from: 'shop@retailer.com' },
    { subject: 'New drops just landed', from: 'hype@streetwear.co' },
    { subject: 'Exclusive offer inside', from: 'promo@brand.io' },
    { subject: 'Last chance: sale ends tonight', from: 'sales@store.com' },
  ],
  updates: [
    { subject: 'Your build failed: main', from: 'ci@github.com' },
    { subject: 'New sign-in from Chrome', from: 'security@google.com' },
    { subject: 'Weekly digest: 12 new issues', from: 'notifications@tracker.dev' },
    { subject: 'Your receipt from AWS', from: 'billing@aws.com' },
    { subject: 'Deploy succeeded: zero-raid', from: 'deploys@vercel.com' },
  ],
  social: [
    { subject: 'Ada mentioned you in a comment', from: 'social@network.com' },
    { subject: 'New follower: doom_fan_93', from: 'alerts@platform.io' },
    { subject: 'You have 3 new invites', from: 'invites@meetup.com' },
    { subject: 'Bob liked your post', from: 'notify@social.app' },
  ],
};

export function getDemoState(cookieHeader: string | undefined): { state: DemoState; isNew: boolean } {
  const match = /zr_demo=([a-z0-9]+)/.exec(cookieHeader || '');
  if (match && states.has(match[1])) {
    return { state: states.get(match[1])!, isNew: false };
  }
  const id = crypto.randomBytes(8).toString('hex');
  const rooms: Record<string, UnreadMessage[]> = {};
  for (const [roomId, mails] of Object.entries(DEMO_SUBJECTS)) {
    rooms[roomId] = mails.map((m, i) => ({
      id: `demo-${roomId}-${i}`,
      threadId: `demo-t-${roomId}-${i}`,
      subject: m.subject,
      from: m.from,
      snippet: `${m.subject} — demo snippet`,
      needsReply: false,
      messageId: `<demo-${roomId}-${i}@zero-raid.local>`,
    }));
  }
  Object.keys(rooms).forEach((roomId, i) => flagNeedsReply(rooms[roomId], i));
  const state: DemoState = { id, rooms };
  states.set(id, state);
  return { state, isNew: true };
}

export function demoCookie(id: string): string {
  return `zr_demo=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

export function demoApply(state: DemoState, id: string): boolean {
  for (const mails of Object.values(state.rooms)) {
    const idx = mails.findIndex((m) => m.id === id);
    if (idx >= 0) {
      mails.splice(idx, 1);
      return true;
    }
  }
  return false;
}
