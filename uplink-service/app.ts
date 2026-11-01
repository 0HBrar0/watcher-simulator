import type { IncomingMessage, ServerResponse } from 'node:http';
import { createLimits } from './limits.ts';

const MAX_BODY = 4096;
const MAX_MESSAGE = 500;
const MAX_CONTACT = 254;
const MAX_HONEYPOT = 100;
const NTFY_TIMEOUT_MS = 8000;
const MAX_CHECK_TOKEN = 2048;
const FIELDS = ['contact', 'contactMethod', 'message', 'website'];
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UplinkConfig {
  ntfyBaseUrl?: string;
  ntfyTopic?: string;
  ntfyToken?: string;
  allowedOrigins: string[];
  /** Turns on the Turnstile check for visitors over their limit. Without it they just wait. */
  turnstileSecret?: string;
  /** True only behind Railway's proxy, whose X-Real-IP a visitor can't set. */
  trustProxy: boolean;
  fetch?: typeof fetch;
  now?: () => number;
}

interface Note {
  message: string;
  contactMethod: 'none' | 'email' | 'other';
  contact: string;
  checkToken?: string;
}

const length = (text: string) => [...text].length;

function send(res: ServerResponse, status: number, body: object, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
}

/** Reads at most MAX_BODY bytes. Null means the body was too large. */
async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  // Keeps reading past the limit without storing it: stopping early would drop the connection before the 413 is sent.
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size <= MAX_BODY) chunks.push(chunk);
  }
  return size > MAX_BODY ? null : Buffer.concat(chunks);
}

/** Null means invalid. A filled honeypot is reported apart so it can be answered with 403. */
function parseNote(raw: Buffer): Note | 'honeypot' | null {
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const fields = data as Record<string, unknown>;
  if (Object.keys(fields).filter((key) => key !== 'turnstileToken').sort().join() !== FIELDS.join()) return null;
  const { message, contactMethod, contact, website, turnstileToken } = fields;
  if (turnstileToken !== undefined && (typeof turnstileToken !== 'string' || !turnstileToken || turnstileToken.length > MAX_CHECK_TOKEN)) return null;
  if (typeof message !== 'string' || typeof contact !== 'string' || typeof website !== 'string') return null;
  if (contactMethod !== 'none' && contactMethod !== 'email' && contactMethod !== 'other') return null;

  const note: Note = { message: message.trim(), contactMethod, contact: contact.trim(), checkToken: turnstileToken };
  const trap = website.trim();
  if (length(trap) > MAX_HONEYPOT || length(note.message) > MAX_MESSAGE || length(note.contact) > MAX_CONTACT) return null;
  if ((note.contactMethod === 'none') !== (note.contact === '')) return null;
  if (note.contactMethod === 'email' && !EMAIL.test(note.contact)) return null;
  return trap ? 'honeypot' : note;
}

/** Only what the visitor wrote. ntfy needs some text, so a blank ping just says so. */
const notificationText = ({ message, contact }: Note) => [message, contact].filter(Boolean).join('\n\n') || 'Ping';

export function createUplink(config: UplinkConfig) {
  const limits = createLimits();
  const post = config.fetch ?? fetch;
  const now = config.now ?? Date.now;
  const ready = Boolean(config.ntfyBaseUrl && config.ntfyTopic && config.allowedOrigins.length > 0);

  const clientIp = (req: IncomingMessage) => {
    const forwarded = config.trustProxy ? req.headers['x-real-ip'] : undefined;
    return (typeof forwarded === 'string' && forwarded) || req.socket.remoteAddress || 'unknown';
  };

  async function passedCheck(token: string, ip: string) {
    try {
      const answer = await post(SITEVERIFY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: config.turnstileSecret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(NTFY_TIMEOUT_MS),
      });
      return ((await answer.json()) as { success?: boolean }).success === true;
    } catch (error) {
      console.error(`human check failed: ${error instanceof Error ? error.name : 'unknown'}`);
      return false;
    }
  }

  async function notify(note: Note): Promise<{ status: number; error?: string }> {
    const headers: Record<string, string> = { Title: 'The Watcher', 'Content-Type': 'text/plain; charset=utf-8' };
    if (config.ntfyToken) headers.Authorization = `Bearer ${config.ntfyToken}`;
    try {
      const answer = await post(`${config.ntfyBaseUrl!.replace(/\/+$/, '')}/${encodeURIComponent(config.ntfyTopic!)}`, {
        method: 'POST',
        headers,
        body: notificationText(note),
        signal: AbortSignal.timeout(NTFY_TIMEOUT_MS),
      });
      if (answer.ok) return { status: 200 };
      console.error(`ntfy refused the notification: ${answer.status}`);
      return { status: 502, error: 'NOTIFICATION_FAILED' };
    } catch (error) {
      // The error itself can quote the topic URL, so only its kind is logged.
      const name = error instanceof Error ? error.name : 'unknown';
      console.error(`ntfy request failed: ${name}`);
      return name === 'TimeoutError' ? { status: 504, error: 'NOTIFICATION_TIMEOUT' } : { status: 502, error: 'NOTIFICATION_FAILED' };
    }
  }

  async function uplink(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    const allowed = origin !== undefined && config.allowedOrigins.includes(origin);
    const cors: Record<string, string> = allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
    const fail = (status: number, error: string, headers: Record<string, string> = {}) => send(res, status, { success: false, error }, { ...cors, ...headers });

    if (origin !== undefined && !allowed) return fail(403, 'FORBIDDEN');
    if (req.method === 'OPTIONS' && allowed) {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
      return res.end();
    }
    if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', { Allow: 'POST, OPTIONS' });
    if ((req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return fail(415, 'UNSUPPORTED_MEDIA_TYPE');
    const raw = await readBody(req);
    if (raw === null) return fail(413, 'PAYLOAD_TOO_LARGE', { Connection: 'close' });
    const note = parseNote(raw);
    if (note === null) return fail(400, 'INVALID_REQUEST');
    if (note === 'honeypot') return fail(403, 'FORBIDDEN');
    if (!ready) return fail(503, 'SERVICE_UNAVAILABLE');

    const ip = clientIp(req);
    let limit = limits.take(ip, now());
    const canCheck = limit.solvable && Boolean(config.turnstileSecret);
    if (canCheck && note.checkToken && (await passedCheck(note.checkToken, ip))) limit = limits.take(ip, now(), true);
    if (limit.wait > 0) {
      const body = { success: false, error: 'RATE_LIMITED', retryAfter: limit.wait, ...(canCheck && { challenge: true }) };
      return send(res, 429, body, { ...cors, 'Retry-After': String(limit.wait) });
    }

    const delivered = await notify(note);
    if (delivered.error) return fail(delivered.status, delivered.error);
    send(res, 200, { success: true, message: 'RECEIVED' }, cors);
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    try {
      const path = (req.url ?? '').split('?')[0];
      if (path === '/api/uplink') return await uplink(req, res);
      if (path !== '/health') return send(res, 404, { success: false, error: 'NOT_FOUND' });
      if (req.method !== 'GET') return send(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED' }, { Allow: 'GET' });
      send(res, ready ? 200 : 503, { status: ready ? 'ok' : 'unavailable' });
    } catch (error) {
      console.error(`request failed: ${error instanceof Error ? error.name : 'unknown'}`);
      if (!res.headersSent) send(res, 500, { success: false, error: 'INTERNAL_ERROR' });
      else res.end();
    }
  };
}
