import { getDemoState, demoCookie, demoApply } from './_lib/demo.js';
import { applyAction, authedSession, type RaidAction } from './_lib/gmail.js';
import { json, readBody, wrap } from './_lib/http.js';
import { oauthConfigured, demoForced, getSession } from './_lib/session.js';

const VALID_ACTIONS: RaidAction[] = ['archive', 'trash', 'star'];

// POST /api/modify { id, action: 'archive'|'trash'|'star' }
export default wrap(async (req, res) => {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'POST only' });
    return;
  }
  const body = await readBody(req);
  const id = String(body.id || '');
  const action = body.action as RaidAction;
  if (!id || !VALID_ACTIONS.includes(action)) {
    json(res, 400, { error: 'expected { id, action: archive|trash|star }' });
    return;
  }

  if (demoForced() || !oauthConfigured() || getSession(req)?.demo) {
    const state = getDemoState(req.headers.cookie);
    const ok = demoApply(state, id);
    res.setHeader('Set-Cookie', demoCookie(state));
    json(res, ok ? 200 : 404, { ok });
    return;
  }

  const session = await authedSession(req, res);
  if (!session) {
    json(res, 401, { error: 'not connected' });
    return;
  }
  await applyAction(session, id, action);
  json(res, 200, { ok: true });
});
