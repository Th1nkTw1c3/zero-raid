import { getDemoState, demoCookie, demoApply } from './_lib/demo.js';
import { sendReply, authedSession } from './_lib/gmail.js';
import { json, readBody, wrap } from './_lib/http.js';
import { oauthConfigured, demoForced, getSession } from './_lib/session.js';

// POST /api/reply { id, threadId, subject, from, messageId, body }
// The "spell": sends a real threaded reply via gmail.send, then archives.
export default wrap(async (req, res) => {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'POST only' });
    return;
  }
  const body = await readBody(req);
  const id = String(body.id || '');
  const text = String(body.body || '').trim();
  if (!id || !text) {
    json(res, 400, { error: 'expected { id, body }' });
    return;
  }

  if (demoForced() || !oauthConfigured() || getSession(req)?.demo) {
    const state = getDemoState(req.headers.cookie);
    demoApply(state, id);
    res.setHeader('Set-Cookie', demoCookie(state));
    json(res, 200, { ok: true, simulated: true });
    return;
  }

  const session = await authedSession(req, res);
  if (!session) {
    json(res, 401, { error: 'not connected' });
    return;
  }
  await sendReply(
    session,
    {
      id,
      threadId: String(body.threadId || ''),
      subject: String(body.subject || '(no subject)'),
      from: String(body.from || ''),
      messageId: String(body.messageId || ''),
    },
    text.slice(0, 4000),
  );
  json(res, 200, { ok: true });
});
