import type { RoomsResponse, StatusResponse, RaidAction } from './types';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  status: () => req<StatusResponse>('/api/status'),
  rooms: () => req<RoomsResponse>('/api/rooms'),
  modify: (id: string, action: RaidAction) =>
    req<{ ok: boolean }>('/api/modify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    }),
  reply: (msg: { id: string; threadId: string; subject: string; from: string; messageId: string }, body: string) =>
    req<{ ok: boolean; simulated?: boolean }>('/api/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: msg.id,
        threadId: msg.threadId,
        subject: msg.subject,
        from: msg.from,
        messageId: msg.messageId,
        body,
      }),
    }),
};
