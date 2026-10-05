import { json, wrap } from './_lib/http.js';
import { getSession, oauthConfigured, demoForced } from './_lib/session.js';

// GET /api/status -> { mode: 'gmail'|'demo'|'unauth', connected, email? }
export default wrap((req, res) => {
  if (demoForced() || !oauthConfigured()) {
    json(res, 200, { mode: 'demo', demo: true, connected: true, email: 'demo@zero-raid.local' });
    return;
  }
  const session = getSession(req);
  if (session?.demo) {
    json(res, 200, { mode: 'demo', demo: true, connected: true, email: 'demo@zero-raid.local' });
    return;
  }
  if (session) {
    json(res, 200, { mode: 'gmail', demo: false, connected: true, email: session.email });
    return;
  }
  json(res, 200, { mode: 'unauth', demo: false, connected: false });
});
