import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const COOKIE_NAME = 'zr_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  email: string;
  demo?: boolean;
}

function key(): Buffer {
  const secret = process.env.SESSION_SECRET || 'zero-raid-insecure-dev-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

function encode(session: Session): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString('base64url');
}

function decode(raw: string): Session | null {
  try {
    const buf = Buffer.from(raw, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(json) as Session;
  } catch {
    return null;
  }
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function getSession(req: IncomingMessage): Session | null {
  const raw = parseCookies(req)[COOKIE_NAME];
  return raw ? decode(raw) : null;
}

function isSecure(req: IncomingMessage): boolean {
  return (req.headers['x-forwarded-proto'] || '') === 'https';
}

export function setSession(req: IncomingMessage, res: ServerResponse, session: Session): void {
  const parts = [
    `${COOKIE_NAME}=${encode(session)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE}`,
  ];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSession(res: ServerResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function baseUrl(req: IncomingMessage): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const host = req.headers.host || 'localhost:5173';
  return `${proto}://${host}`;
}

export function redirectUri(req: IncomingMessage): string {
  return process.env.GOOGLE_REDIRECT_URI || `${baseUrl(req)}/api/callback`;
}

export function oauthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function demoForced(): boolean {
  return process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true';
}
