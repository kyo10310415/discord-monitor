import { Hono } from 'hono';
import { requireAdmin, requireJobToken, type AccessConfig } from './lib/access.js';
import { summarizeLog, summarizeResult, type MonitorResult } from './lib/results.js';
import { dashboardHtml } from './dashboard.js';

export interface AppServices {
  stats(): { channelCount: number; lastCheck: string | null };
  logs(): Record<string, unknown>[];
  monitor(test: boolean): Promise<MonitorResult>;
}

export function createApp(config: AccessConfig, services: AppServices) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    if (c.req.path === '/health' && ['GET', 'HEAD'].includes(c.req.method)) return next();
    if (c.req.path === '/api/jobs/monitor' && c.req.method === 'POST') return requireJobToken(config)(c, next);
    return requireAdmin(config)(c, next);
  });
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/', (c) => c.html(dashboardHtml));
  app.get('/api/stats', (c) => c.json(services.stats()));
  app.get('/api/logs', (c) => c.json({ logs: services.logs().map(summarizeLog) }));
  const run = (test: boolean) => async (c: import('hono').Context) => {
    try { return c.json(summarizeResult(await services.monitor(test))); }
    catch { return c.json({ error: '監視処理に失敗しました。管理者が実行環境を確認してください。' }, 500); }
  };
  app.post('/api/monitor/run', run(false));
  app.post('/api/monitor/test', run(true));
  app.post('/api/jobs/monitor', run(false));
  app.onError((_error, c) => c.json({ error: '処理に失敗しました。' }, 500));
  return app;
}
