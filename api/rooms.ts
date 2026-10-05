import { getDemoState, demoRooms } from './_lib/demo.js';
import { ROOMS, fetchUnread, authedSession, flagNeedsReply } from './_lib/gmail.js';
import { json, wrap } from './_lib/http.js';
import { oauthConfigured, demoForced, getSession } from './_lib/session.js';

// GET /api/rooms -> [{ id, name, unread: [{id, subject, from, snippet, needsReply}] }]
export default wrap(async (req, res) => {
  if (demoForced() || !oauthConfigured() || getSession(req)?.demo) {
    const state = getDemoState(req.headers.cookie);
    const rooms = demoRooms(state);
    json(res, 200, {
      demo: true,
      rooms: ROOMS.map((r) => ({ id: r.id, name: r.name, unread: rooms[r.id] || [] })),
    });
    return;
  }

  const session = await authedSession(req, res);
  if (!session) {
    json(res, 401, { error: 'not connected' });
    return;
  }
  const rooms = await Promise.all(
    ROOMS.map(async (room) => ({
      id: room.id,
      name: room.name,
      unread: await fetchUnread(session, room.query),
    })),
  );
  rooms.forEach((room, i) => flagNeedsReply(room.unread, i));
  json(res, 200, { demo: false, rooms });
});
