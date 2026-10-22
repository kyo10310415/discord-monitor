import { serve } from '@hono/node-server';
import cron from 'node-cron';
import { createApp } from './app.js';
import { loadAccessConfig } from './lib/access.js';
import { summarizeResult } from './lib/results.js';
import { monitorChannels, type Env } from './lib/monitor.js';
import { initDb, getDb } from './lib/init-db.js';

// 環境変数からEnvオブジェクトを生成
function getEnv(): Env {
  const required = [
    'DISCORD_BOT_TOKEN',
    'SLACK_WEBHOOK_URL',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_SPREADSHEET_ID',
    'GOOGLE_SHEET_NAME',
  ];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
  }
  return {
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN!,
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL!,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY!,
    GOOGLE_SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID!,
    GOOGLE_SHEET_NAME: process.env.GOOGLE_SHEET_NAME!,
  };
}


// Validate access settings before opening the database, starting HTTP or scheduling work.
const access = loadAccessConfig(process.env);
const app = createApp(access, {
  stats() {
    const db = getDb();
    try {
      const channelCount = (db.prepare('SELECT COUNT(*) as count FROM channels').get() as { count: number }).count;
      const lastCheck = db.prepare('SELECT checked_at FROM check_logs ORDER BY checked_at DESC LIMIT 1').get() as { checked_at: string } | undefined;
      return { channelCount, lastCheck: lastCheck?.checked_at || null };
    } finally { db.close(); }
  },
  logs() {
    const db = getDb();
    try {
      return db.prepare('SELECT id, checked_at, channels_checked, alerts_sent, status, error_message, channel_details FROM check_logs ORDER BY checked_at DESC LIMIT 50').all() as Record<string, unknown>[];
    } finally { db.close(); }
  },
  async monitor(test) {
    const result = await monitorChannels(getEnv(), { skipSlackNotification: test });
    console.log('[Monitor] Summary:', summarizeResult(result));
    return result;
  },
});

initDb();
const PORT = parseInt(process.env.PORT || '10000');
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Server running on port ${PORT}`);
});

cron.schedule('0 8 * * *', async () => {
  try {
    const result = await monitorChannels(getEnv());
    console.log('[Cron] Summary:', summarizeResult(result));
  } catch {
    console.error('[Cron] Monitor failed');
  }
}, { timezone: 'UTC' });
console.log('Cron scheduled: 0 8 * * * (UTC) = JST 17:00');
