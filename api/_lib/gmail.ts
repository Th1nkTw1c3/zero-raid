import type { IncomingMessage, ServerResponse } from 'node:http';
import { getSession, setSession, redirectUri, type Session } from './session.js';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// gmail.modify: read + archive/trash/star. gmail.send: the reply spell.
export const GMAIL_SCOPES =
  'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send';

export interface UnreadMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  needsReply: boolean;
  messageId: string; // RFC Message-ID header, used to thread replies
}

const REPLY_HINT =
  /\?|re:|fwd:|rsvp|confirm|approve|review|reply|response|thoughts|feedback|deadline|urgent/i;
const BULK_SENDER = /no-?reply|newsletter|notification|mailer|digest|bounce/i;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// Mark messages that likely need a real reply (the "cursed" demons).
// Heuristic subject/sender match, plus an escalating quota by level so
// deeper rooms always contain mail that resists one-click deletion.
export function flagNeedsReply(messages: UnreadMessage[], levelIndex: number): void {
  let flagged = 0;
  for (const m of messages) {
    m.needsReply =
      (!BULK_SENDER.test(m.from) && REPLY_HINT.test(m.subject)) ||
      hashId(m.id) % 10 < levelIndex * 2;
    if (m.needsReply) flagged++;
  }
  // Guarantee at least one cursed demon in deeper rooms with enough mail.
  if (levelIndex > 0 && flagged === 0 && messages.length >= 2) {
    messages[hashId(messages[0].id) % messages.length].needsReply = true;
  }
}

export interface Room {
  id: string;
  name: string;
  query: string;
}

// The four Gmail category rooms, in dungeon order.
export const ROOMS: Room[] = [
  { id: 'primary', name: 'PRIMARY', query: 'in:inbox is:unread category:primary' },
  { id: 'promotions', name: 'PROMOTIONS', query: 'in:inbox is:unread category:promotions' },
  { id: 'updates', name: 'UPDATES', query: 'in:inbox is:unread category:updates' },
  { id: 'social', name: 'SOCIAL', query: 'in:inbox is:unread category:social' },
];

export async function exchangeCode(req: IncomingMessage, code: string) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uri: redirectUri(req),
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

async function refreshAccessToken(session: Session): Promise<Session> {
  const body = new URLSearchParams({
    refresh_token: session.refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    ...session,
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 30_000,
  };
}

// Returns a session with a valid access token, refreshing + re-setting the cookie if needed.
export async function authedSession(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Session | null> {
  let session = getSession(req);
  if (!session || session.demo) return session;
  if (Date.now() >= session.expiresAt) {
    session = await refreshAccessToken(session);
    setSession(req, res, session);
  }
  return session;
}

async function gmailFetch(session: Session, path: string, init?: RequestInit) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`gmail ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

export async function fetchUnread(
  session: Session,
  query: string,
  maxResults = 20,
): Promise<UnreadMessage[]> {
  const listRes = await gmailFetch(
    session,
    `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
  );
  const list = (await listRes.json()) as { messages?: { id: string; threadId: string }[] };
  const ids = list.messages || [];

  const messages = await Promise.all(
    ids.map(async (m) => {
      const msgRes = await gmailFetch(
        session,
        `/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID`,
      );
      const msg = (await msgRes.json()) as {
        id: string;
        threadId: string;
        snippet: string;
        payload?: { headers?: { name: string; value: string }[] };
      };
      const headers = msg.payload?.headers || [];
      const get = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      return {
        id: msg.id,
        threadId: msg.threadId,
        subject: get('Subject') || '(no subject)',
        from: get('From'),
        snippet: msg.snippet || '',
        needsReply: false,
        messageId: get('Message-ID'),
      };
    }),
  );
  return messages;
}

export type RaidAction = 'archive' | 'trash' | 'star';

export async function applyAction(session: Session, id: string, action: RaidAction) {
  if (action === 'trash') {
    await gmailFetch(session, `/messages/${id}/trash`, { method: 'POST' });
    return;
  }
  const addLabelIds = action === 'star' ? ['STARRED'] : [];
  const removeLabelIds = action === 'star' ? ['UNREAD'] : ['INBOX', 'UNREAD'];
  await gmailFetch(session, `/messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

export async function fetchProfile(session: Session): Promise<string> {
  const res = await gmailFetch(session, '/profile');
  const data = (await res.json()) as { emailAddress: string };
  return data.emailAddress;
}

function parseAddress(from: string): string {
  const match = /<([^>]+)>/.exec(from);
  return (match ? match[1] : from).trim();
}

// The reply spell: sends a real threaded reply, then archives the original.
export async function sendReply(
  session: Session,
  msg: { id: string; threadId: string; subject: string; from: string; messageId: string },
  body: string,
) {
  const subject = /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`;
  const lines = [
    `To: ${parseAddress(msg.from)}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];
  if (msg.messageId) {
    lines.push(`In-Reply-To: ${msg.messageId}`, `References: ${msg.messageId}`);
  }
  const raw = Buffer.from(`${lines.join('\r\n')}\r\n\r\n${body}`, 'utf8').toString('base64url');
  await gmailFetch(session, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw, threadId: msg.threadId }),
  });
  // A reply counts as triaged: clear INBOX + UNREAD off the original.
  await gmailFetch(session, `/messages/${msg.id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['INBOX', 'UNREAD'] }),
  });
}
