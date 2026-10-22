import { createHash, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

export interface AccessConfig {
  adminUsername: string;
  adminPassword: string;
  jobToken: string;
  publicOrigin: string;
}

export function loadAccessConfig(env: NodeJS.ProcessEnv): AccessConfig {
  const adminUsername = env.MONITOR_ADMIN_USERNAME || '';
  const adminPassword = env.MONITOR_ADMIN_PASSWORD || '';
  const jobToken = env.MONITOR_JOB_TOKEN || '';
  if (!/^[A-Za-z0-9_.@-]{1,100}$/.test(adminUsername)) {
    throw new Error('MONITOR_ADMIN_USERNAME is required and must be a valid account name');
  }
  for (const [name, value] of [['MONITOR_ADMIN_PASSWORD', adminPassword], ['MONITOR_JOB_TOKEN', jobToken]]) {
    if (value.length < 32 || value.length > 512 || /\s/.test(value)) {
      throw new Error(`${name} must be an independently generated secret of at least 32 characters`);
    }
  }
  if (adminPassword === jobToken) throw new Error('Admin password and job token must be different');
  let origin: URL;
  try { origin = new URL(env.MONITOR_PUBLIC_ORIGIN || ''); }
  catch { throw new Error('MONITOR_PUBLIC_ORIGIN is required'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) {
    throw new Error('MONITOR_PUBLIC_ORIGIN must be an HTTPS origin (HTTP is allowed only for local development)');
  }
  return { adminUsername, adminPassword, jobToken, publicOrigin: origin.origin };
}

function sameSecret(actual: string, expected: string): boolean {
  return timingSafeEqual(createHash('sha256').update(actual).digest(), createHash('sha256').update(expected).digest());
}

export function requireAdmin(config: AccessConfig): MiddlewareHandler {
  return async (c, next) => {
    const authorization = c.req.header('Authorization') || '';
    if (authorization.startsWith('Bearer ')) return c.json({ error: 'Forbidden' }, 403);
    const encoded = authorization.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i)?.[1];
    const credentials = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
    const separator = credentials.indexOf(':');
    const username = separator < 0 ? '' : credentials.slice(0, separator);
    const password = separator < 0 ? '' : credentials.slice(separator + 1);
    const userMatches = sameSecret(username, config.adminUsername);
    const passwordMatches = sameSecret(password, config.adminPassword);
    if (!userMatches || !passwordMatches) {
      c.header('WWW-Authenticate', 'Basic realm="Discord monitor admin", charset="UTF-8"');
      return c.json({ error: 'Authentication required' }, 401);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('Origin');
      if (c.req.header('X-Monitor-Request') !== '1' || (origin && origin !== config.publicOrigin)) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }
    await next();
  };
}

export function requireJobToken(config: AccessConfig): MiddlewareHandler {
  return async (c, next) => {
    const token = c.req.header('Authorization')?.match(/^Bearer (\S+)$/)?.[1] || '';
    if (!sameSecret(token, config.jobToken)) return c.json({ error: 'Authentication required' }, 401);
    await next();
  };
}
