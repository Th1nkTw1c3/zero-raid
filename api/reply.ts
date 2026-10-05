import { getDemoState, demoCookie, demoApply } from './_lib/demo';
import { sendReply, authedSession } from './_lib/gmail';
import { json, readBody, wrap } from './_lib/http';
import { oauthConfigured, demoForced, getSession } from './_lib/session';

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
    const { state, isNew } = getDemoState(req.headers.cookie);
    if (isNew) res.setHeader('Set-Cookie', demoCookie(state.id));
    demoApply(state, id);
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
