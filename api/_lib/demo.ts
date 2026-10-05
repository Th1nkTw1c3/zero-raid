// Demo mode: seeded fake mail. Stateless — the zr_demo cookie carries the set
// of consumed message ids, so this works across serverless invocations.
import { flagNeedsReply, type UnreadMessage } from './gmail.js';

export interface DemoState {
  consumed: Set<string>;
}

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

function seededRooms(): Record<string, UnreadMessage[]> {
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
  return rooms;
}

export function getDemoState(cookieHeader: string | undefined): DemoState {
  const match = /(?:^|;\s*)zr_demo=([^;]+)/.exec(cookieHeader || '');
  const ids = match ? decodeURIComponent(match[1]).split(',').filter(Boolean) : [];
  return { consumed: new Set(ids) };
}

export function demoRooms(state: DemoState): Record<string, UnreadMessage[]> {
  const rooms = seededRooms();
  for (const list of Object.values(rooms)) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (state.consumed.has(list[i].id)) list.splice(i, 1);
    }
  }
  return rooms;
}

export function demoCookie(state: DemoState): string {
  const val = encodeURIComponent([...state.consumed].join(','));
  return `zr_demo=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

export function demoApply(state: DemoState, id: string): boolean {
  const known = Object.values(seededRooms()).some((list) => list.some((m) => m.id === id));
  if (!known || state.consumed.has(id)) return false;
  state.consumed.add(id);
  return true;
}
