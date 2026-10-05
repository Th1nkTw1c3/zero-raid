import { exchangeCode, fetchProfile } from './_lib/gmail';
import { redirect, query, wrap } from './_lib/http';
import { setSession, type Session } from './_lib/session';

// GET /api/callback?code=... -> exchange code, set encrypted session cookie, go to game
export default wrap(async (req, res) => {
  const q = query(req);
  const code = q.get('code');
  const error = q.get('error');
  if (error || !code) {
    redirect(res, `/?auth_error=${encodeURIComponent(error || 'missing_code')}`);
    return;
  }
  const tokens = await exchangeCode(req, code);
  if (!tokens.refresh_token) {
    redirect(res, '/?auth_error=no_refresh_token');
    return;
  }
  const session: Session = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000 - 30_000,
    email: '',
  };
  session.email = await fetchProfile(session);
  setSession(req, res, session);
  redirect(res, '/?connected=1');
});
