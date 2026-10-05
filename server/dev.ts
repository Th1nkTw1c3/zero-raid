// Local dev server: mounts the same pure-node handlers that Vercel deploys as
// serverless functions, plus static dist/ serving for `npm start`.
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';

import auth from '../api/auth.js';
import callback from '../api/callback.js';
import status from '../api/status.js';
import rooms from '../api/rooms.js';
import modify from '../api/modify.js';
import reply from '../api/reply.js';
import logout from '../api/logout.js';

const app = express();
const PORT = Number(process.env.API_PORT || 8787);

app.all('/api/auth', (req, res) => void auth(req, res));
app.all('/api/callback', (req, res) => void callback(req, res));
app.all('/api/status', (req, res) => void status(req, res));
app.all('/api/rooms', (req, res) => void rooms(req, res));
app.all('/api/modify', (req, res) => void modify(req, res));
app.all('/api/reply', (req, res) => void reply(req, res));
app.all('/api/logout', (req, res) => void logout(req, res));

// Serve the production build if it exists (npm start after npm run build).
const dist = path.resolve(import.meta.dirname, '../dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

createServer(app).listen(PORT, () => {
  console.log(`[zero-raid] API listening on http://localhost:${PORT}`);
});
