import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import cron from 'node-cron';
import { monitorChannels, Env } from './lib/monitor.js';
import { DiscordClient } from './lib/discord.js';
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

const app = new Hono();

app.use('/api/*', cors());

// =====================================
// Web UI - Dashboard
// =====================================

app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Discord Channel Monitor</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <div class="min-h-screen">
            <header class="bg-white shadow-sm border-b border-gray-200">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-3">
                            <i class="fab fa-discord text-indigo-600 text-3xl"></i>
                            <h1 class="text-2xl font-bold text-gray-900">Discord Channel Monitor</h1>
                            <span class="text-sm text-gray-500 ml-4">
                                <i class="fas fa-table mr-1"></i>スプレッドシート連携
                            </span>
                        </div>
                        <div class="flex items-center space-x-3">
                            <button onclick="runMonitorTest()" id="testBtn"
                                class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition">
                                <i class="fas fa-vial"></i><span>テスト実行</span>
                            </button>
                            <button onclick="runMonitor()" id="runBtn"
                                class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition">
                                <i class="fas fa-play"></i><span>本番実行</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <!-- Stats Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div class="bg-white rounded-lg shadow p-6">
                        <div class="flex items-center">
                            <div class="p-3 rounded-full bg-green-100 text-green-600">
                                <i class="fas fa-hashtag text-2xl"></i>
                            </div>
                            <div class="ml-4">
                                <p class="text-sm text-gray-600">監視チャンネル数</p>
                                <p class="text-2xl font-bold text-gray-900" id="channelCount">0</p>
                            </div>
                        </div>
                    </div>
                    <div class="bg-white rounded-lg shadow p-6">
                        <div class="flex items-center">
                            <div class="p-3 rounded-full bg-purple-100 text-purple-600">
                                <i class="fas fa-clock text-2xl"></i>
                            </div>
                            <div class="ml-4">
                                <p class="text-sm text-gray-600">最終チェック</p>
                                <p class="text-sm font-medium text-gray-900" id="lastCheck">未実行</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Spreadsheet Info -->
                <div class="bg-white rounded-lg shadow mb-8">
                    <div class="px-6 py-4 border-b border-gray-200">
                        <h2 class="text-lg font-semibold text-gray-900">
                            <i class="fas fa-table text-indigo-600 mr-2"></i>監視対象の設定方法
                        </h2>
                    </div>
                    <div class="p-6">
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 class="font-semibold text-blue-900 mb-2">
                                <i class="fas fa-info-circle mr-2"></i>スプレッドシートから自動取得
                            </h3>
                            <div class="text-sm text-blue-700 space-y-1">
                                <p>📊 <strong>スプレッドシート形式:</strong></p>
                                <ul class="list-disc list-inside ml-4 space-y-1">
                                    <li>A列: 生徒名</li>
                                    <li>B列: 学籍番号</li>
                                    <li>C列: メモURL（Discord チャンネルURL）</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Logs -->
                <div class="bg-white rounded-lg shadow">
                    <div class="px-6 py-4 border-b border-gray-200">
                        <h2 class="text-lg font-semibold text-gray-900">
                            <i class="fas fa-history text-indigo-600 mr-2"></i>監視ログ
                        </h2>
                    </div>
                    <div class="p-6">
                        <div id="logList" class="space-y-2">
                            <p class="text-gray-500 text-center py-8">ログがありません</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            document.addEventListener('DOMContentLoaded', () => {
                loadStats();
                loadLogs();
            });

            async function loadStats() {
                try {
                    const response = await axios.get('/api/stats');
                    document.getElementById('channelCount').textContent = response.data.channelCount;
                    if (response.data.lastCheck) {
                        const date = new Date(response.data.lastCheck);
                        document.getElementById('lastCheck').textContent =
                            date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + ' (JST)';
                    }
                } catch (e) { console.error(e); }
            }

            async function loadLogs() {
                try {
                    const response = await axios.get('/api/logs');
                    const logs = response.data.logs;
                    const listEl = document.getElementById('logList');
                    if (logs.length === 0) {
                        listEl.innerHTML = '<p class="text-gray-500 text-center py-8">ログがありません</p>';
                        return;
                    }
                    listEl.innerHTML = logs.map(log => {
                        const statusIcon = log.status === 'success' ? 'fa-check-circle text-green-600' :
                                          log.status === 'error'   ? 'fa-times-circle text-red-600' :
                                                                     'fa-exclamation-circle text-yellow-600';
                        const date = new Date(log.checked_at);
                        let errorHtml = '';
                        if (log.channel_details) {
                            try {
                                const details = JSON.parse(log.channel_details);
                                if (details && details.length > 0) {
                                    errorHtml = '<div class="mt-2 space-y-1">' +
                                        details.slice(0, 5).map(d =>
                                            \`<div class="text-xs"><span class="text-red-600">• \${d.studentName} (\${d.studentId}): \${d.error}</span>
                                            <a href="\${d.memoUrl}" target="_blank" class="text-blue-600 hover:underline ml-1"><i class="fas fa-external-link-alt"></i> メモを開く</a></div>\`
                                        ).join('');
                                    if (details.length > 5) errorHtml += \`<div class="text-xs text-gray-500">• ... 他\${details.length - 5}件</div>\`;
                                    errorHtml += '</div>';
                                }
                            } catch (e) {}
                        }
                        return \`
                            <div class="flex items-start space-x-3 p-3 border border-gray-200 rounded">
                                <i class="fas \${statusIcon} mt-1"></i>
                                <div class="flex-1">
                                    <p class="text-sm text-gray-900">
                                        \${date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} (JST) -
                                        <span class="font-medium">\${log.channels_checked}</span>個チェック、
                                        <span class="font-medium text-red-600">\${log.alerts_sent}</span>件通知
                                    </p>
                                    \${errorHtml}
                                </div>
                            </div>
                        \`;
                    }).join('');
                } catch (e) { console.error(e); }
            }

            async function runMonitor() {
                const btn = document.getElementById('runBtn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>実行中...</span>';
                try {
                    const response = await axios.post('/api/monitor/run');
                    const inactiveList = response.data.inactiveChannels.map(ch =>
                        \`- \${ch.channelName} (\${ch.studentName})\`
                    ).join('\\n');
                    alert(\`監視完了（Slack通知送信済み）\\n\\nチェック: \${response.data.channelsChecked}個\\n通知: \${response.data.alertsSent}件\\n\\n更新停止:\\n\${inactiveList || 'なし'}\`);
                    loadStats(); loadLogs();
                } catch (e) {
                    alert('エラー: ' + (e.response?.data?.error || e.message));
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-play"></i><span>本番実行</span>';
                }
            }

            async function runMonitorTest() {
                const btn = document.getElementById('testBtn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>実行中...</span>';
                try {
                    const response = await axios.post('/api/monitor/test');
                    const inactiveList = response.data.inactiveChannels.map(ch =>
                        \`- \${ch.studentName} (\${ch.studentId}) 最終更新: \${ch.lastMessageAt ? new Date(ch.lastMessageAt).toLocaleString('ja-JP') : '不明'}\`
                    ).join('\\n');
                    alert(\`テスト完了（Slack通知なし）\\n\\nチェック: \${response.data.channelsChecked}個\\n更新停止: \${response.data.inactiveChannels.length}件\\n\\n更新停止:\\n\${inactiveList || 'なし'}\`);
                    loadStats(); loadLogs();
                } catch (e) {
                    alert('エラー: ' + (e.response?.data?.error || e.message));
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-vial"></i><span>テスト実行</span>';
                }
            }
        </script>
    </body>
    </html>
  `);
});

// =====================================
// API Routes
// =====================================

app.get('/api/stats', (c) => {
  const db = getDb();
  try {
    const channelCount = (db.prepare('SELECT COUNT(*) as count FROM channels').get() as any).count;
    const lastCheck = db.prepare('SELECT checked_at FROM check_logs ORDER BY checked_at DESC LIMIT 1').get() as any;
    return c.json({ channelCount, lastCheck: lastCheck?.checked_at || null });
  } finally {
    db.close();
  }
});

app.get('/api/logs', (c) => {
  const db = getDb();
  try {
    const logs = db.prepare('SELECT * FROM check_logs ORDER BY checked_at DESC LIMIT 50').all();
    return c.json({ logs });
  } finally {
    db.close();
  }
});

app.post('/api/monitor/run', async (c) => {
  try {
    const result = await monitorChannels(getEnv());
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

app.post('/api/monitor/test', async (c) => {
  try {
    const result = await monitorChannels(getEnv(), { skipSlackNotification: true });
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// =====================================
// サーバー起動 + Cron設定
// =====================================

// DB初期化
initDb();

const PORT = parseInt(process.env.PORT || '3000');

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});

// Cron: 毎日 UTC 08:00 = JST 17:00
cron.schedule('0 8 * * *', async () => {
  console.log(`[${new Date().toISOString()}] Cron triggered: running monitor...`);
  try {
    const result = await monitorChannels(getEnv());
    console.log(`[Cron] Done: checked=${result.channelsChecked}, alerts=${result.alertsSent}, errors=${result.errors.length}`);
  } catch (e) {
    console.error('[Cron] Error:', e);
  }
}, { timezone: 'UTC' });

console.log('⏰ Cron scheduled: 0 8 * * * (UTC) = JST 17:00');
