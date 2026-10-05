import { json, wrap } from './_lib/http.js';
import { clearSession } from './_lib/session.js';

// GET/POST /api/logout -> clear session cookie
export default wrap((_req, res) => {
  clearSession(res);
  json(res, 200, { ok: true });
});
