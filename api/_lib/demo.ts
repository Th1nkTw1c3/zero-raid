// Demo mode: seeded fake mail. Stateless — the zr_demo cookie carries the set
// of consumed message ids, so this works across serverless invocations.
import { flagNeedsReply, pickBoss, type UnreadMessage } from './gmail.js';

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
    { subject: 'Quick question about the budget?', from: 'cfo@work.com' },
    { subject: 'Standup moved to 10am', from: 'calendar-notification@work.com' },
  ],
  promotions: [
    { subject: '50% OFF — this weekend only!', from: 'deals@megamart.com' },
    { subject: 'Your cart misses you', from: 'shop@retailer.com' },
    { subject: 'New drops just landed', from: 'hype@streetwear.co' },
    { subject: 'Exclusive offer inside', from: 'promo@brand.io' },
    { subject: 'Last chance: sale ends tonight', from: 'sales@store.com' },
    { subject: 'Members get 20% extra', from: 'club@brand.io' },
    { subject: 'Flash sale ⚡', from: 'deals@shop.com' },
  ],
  updates: [
    { subject: 'Your build failed: main', from: 'ci@github.com' },
    { subject: 'New sign-in from Chrome', from: 'security@google.com' },
    { subject: 'Weekly digest: 12 new issues', from: 'notifications@tracker.dev' },
    { subject: 'Your receipt from AWS', from: 'billing@aws.com' },
    { subject: 'Deploy succeeded: zero-raid', from: 'deploys@vercel.com' },
    { subject: 'Password changed', from: 'security@service.io' },
    { subject: 'Your package shipped', from: 'tracking@courier.com' },
  ],
  social: [
    { subject: 'Ada mentioned you in a comment', from: 'social@network.com' },
    { subject: 'New follower: doom_fan_93', from: 'alerts@platform.io' },
    { subject: 'You have 3 new invites', from: 'invites@meetup.com' },
    { subject: 'Bob liked your post', from: 'notify@social.app' },
    { subject: 'Carol commented on your photo', from: 'notify@photos.app' },
    { subject: '3 people viewed your profile', from: 'alerts@network.com' },
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
      boss: false,
      messageId: `<demo-${roomId}-${i}@zero-raid.local>`,
    }));
  }
  Object.keys(rooms).forEach((roomId, i) => {
    flagNeedsReply(rooms[roomId], i);
    pickBoss(rooms[roomId]);
  });
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
  if (state.consumed.has(id)) return false;
  state.consumed.add(id);
  return true;
}
