import { createServer } from 'node:http';
import { createUplink } from './app.ts';

const { NTFY_BASE_URL, NTFY_TOPIC, NTFY_TOKEN, ALLOWED_ORIGINS, TURNSTILE_SECRET_KEY, PORT, RAILWAY_ENVIRONMENT_ID } = process.env;

const server = createServer(
  createUplink({
    ntfyBaseUrl: NTFY_BASE_URL,
    ntfyTopic: NTFY_TOPIC,
    ntfyToken: NTFY_TOKEN || undefined,
    allowedOrigins: (ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
    turnstileSecret: TURNSTILE_SECRET_KEY || undefined,
    trustProxy: Boolean(RAILWAY_ENVIRONMENT_ID),
  }),
);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(PORT) || 8787, () => console.log('uplink service listening'));
