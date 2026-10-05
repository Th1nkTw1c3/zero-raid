import { json, wrap } from './_lib/http';
import { clearSession } from './_lib/session';

// GET/POST /api/logout -> clear session cookie
export default wrap((_req, res) => {
  clearSession(res);
  json(res, 200, { ok: true });
});
