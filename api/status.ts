import { getDemoState, demoCookie } from './_lib/demo';
import { json, wrap } from './_lib/http';
import { getSession, oauthConfigured, demoForced } from './_lib/session';

// GET /api/status -> { mode: 'gmail'|'demo'|'unauth', email?, demo }
export default wrap((req, res) => {
  if (demoForced() || !oauthConfigured()) {
    const { state, isNew } = getDemoState(req.headers.cookie);
    if (isNew) res.setHeader('Set-Cookie', demoCookie(state.id));
    json(res, 200, { mode: 'demo', demo: true, connected: true, email: 'demo@zero-raid.local' });
    return;
  }
  const session = getSession(req);
  if (session?.demo) {
    const { state } = getDemoState(req.headers.cookie);
    res.setHeader('Set-Cookie', demoCookie(state.id));
    json(res, 200, { mode: 'demo', demo: true, connected: true, email: 'demo@zero-raid.local' });
    return;
  }
  if (session) {
    json(res, 200, { mode: 'gmail', demo: false, connected: true, email: session.email });
    return;
  }
  json(res, 200, { mode: 'unauth', demo: false, connected: false });
});
