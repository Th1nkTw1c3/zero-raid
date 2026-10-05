import { GMAIL_SCOPES } from './_lib/gmail.js';
import { redirect, json, query, wrap } from './_lib/http.js';
import { oauthConfigured, redirectUri, setSession } from './_lib/session.js';

// GET /api/auth -> redirect to Google consent (least-privilege scopes).
// GET /api/auth?demo=1 -> enter demo mode even when OAuth is configured.
export default wrap((req, res) => {
  if (query(req).get('demo') === '1') {
    setSession(req, res, {
      accessToken: '',
      refreshToken: '',
      expiresAt: 0,
      email: 'demo@zero-raid.local',
      demo: true,
    });
    redirect(res, '/?demo=1');
    return;
  }
  if (!oauthConfigured()) {
    json(res, 400, { error: 'GOOGLE_CLIENT_ID/SECRET not configured' });
    return;
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: GMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
  });
  redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});
