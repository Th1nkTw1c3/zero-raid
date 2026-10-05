import { getDemoState, demoCookie } from './_lib/demo';
import { ROOMS, fetchUnread, authedSession, flagNeedsReply } from './_lib/gmail';
import { json, wrap } from './_lib/http';
import { oauthConfigured, demoForced, getSession } from './_lib/session';

// GET /api/rooms -> [{ id, name, unread: [{id, subject, from, snippet, needsReply}] }]
export default wrap(async (req, res) => {
  if (demoForced() || !oauthConfigured() || getSession(req)?.demo) {
    const { state, isNew } = getDemoState(req.headers.cookie);
    if (isNew) res.setHeader('Set-Cookie', demoCookie(state.id));
    json(res, 200, {
      demo: true,
      rooms: ROOMS.map((r) => ({ id: r.id, name: r.name, unread: state.rooms[r.id] || [] })),
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
