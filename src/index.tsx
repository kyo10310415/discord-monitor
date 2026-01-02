import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
import { monitorChannels, Env } from './lib/monitor';
import { DiscordClient } from './lib/discord';

type Bindings = {
  DB: D1Database;
  DISCORD_BOT_TOKEN: string;
  SLACK_WEBHOOK_URL: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_SPREADSHEET_ID: string;
  GOOGLE_SHEET_NAME: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for API routes
app.use('/api/*', cors());

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }));

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
            <!-- Header -->
            <header class="bg-white shadow-sm border-b border-gray-200">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-3">
                            <i class="fab fa-discord text-indigo-600 text-3xl"></i>
                            <h1 class="text-2xl font-bold text-gray-900">Discord Channel Monitor</h1>
                            <span class="text-sm text-gray-500 ml-4">
                                <i class="fas fa-table mr-1"></i>
                                スプレッドシート連携
                            </span>
                        </div>
                        <div class="flex items-center space-x-3">
                            <button onclick="runMonitorTest()" id="testBtn" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition">
                                <i class="fas fa-vial"></i>
                                <span>テスト実行</span>
                            </button>
                            <button onclick="runMonitor()" id="runBtn" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition">
                                <i class="fas fa-play"></i>
                                <span>本番実行</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <!-- Main Content -->
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

                <!-- Spreadsheet Information -->
                <div class="bg-white rounded-lg shadow mb-8">
                    <div class="px-6 py-4 border-b border-gray-200">
                        <h2 class="text-lg font-semibold text-gray-900">
                            <i class="fas fa-table text-indigo-600 mr-2"></i>
                            監視対象の設定方法
                        </h2>
                    </div>
                    <div class="p-6">
                        <div class="space-y-4">
                            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h3 class="font-semibold text-blue-900 mb-2">
                                    <i class="fas fa-info-circle mr-2"></i>
                                    スプレッドシートから自動取得
                                </h3>
                                <p class="text-sm text-blue-800 mb-2">
                                    監視対象のチャンネルは、Googleスプレッドシートから自動的に取得されます。
                                </p>
                                <div class="text-sm text-blue-700 space-y-1">
                                    <p>📊 <strong>スプレッドシート形式:</strong></p>
                                    <ul class="list-disc list-inside ml-4 space-y-1">
                                        <li>A列: 生徒名</li>
                                        <li>B列: 学籍番号</li>
                                        <li>C列: メモURL（Discord チャンネルURL）</li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                                <h3 class="font-semibold text-green-900 mb-2">
                                    <i class="fas fa-check-circle mr-2"></i>
                                    監視の仕組み
                                </h3>
                                <ul class="text-sm text-green-800 space-y-1 list-disc list-inside">
                                    <li>スプレッドシートのC列（メモURL）のチャンネルのみを監視</li>
                                    <li>2日間以上更新がないチャンネルを検出</li>
                                    <li>Slackに生徒名・学籍番号・メモURLと共に通知</li>
                                    <li>毎日JST 17:00に自動実行</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Check Logs -->
                <div class="bg-white rounded-lg shadow">
                    <div class="px-6 py-4 border-b border-gray-200">
                        <h2 class="text-lg font-semibold text-gray-900">
                            <i class="fas fa-history text-indigo-600 mr-2"></i>
                            監視ログ
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
            // Load data on page load
            document.addEventListener('DOMContentLoaded', () => {
                loadStats();
                loadLogs();
            });

            // Load stats
            async function loadStats() {
                try {
                    const response = await axios.get('/api/stats');
                    document.getElementById('channelCount').textContent = response.data.channelCount;
                    
                    if (response.data.lastCheck) {
                        const date = new Date(response.data.lastCheck);
                        const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
                        document.getElementById('lastCheck').textContent = jstDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + ' (JST)';
                    }
                } catch (error) {
                    console.error('Error loading stats:', error);
                }
            }

            // Load logs
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
                                          log.status === 'error' ? 'fa-times-circle text-red-600' : 
                                          'fa-exclamation-circle text-yellow-600';
                        const date = new Date(log.checked_at);
                        const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
                        
                        let errorHtml = '';
                        if (log.channel_details) {
                            try {
                                const details = JSON.parse(log.channel_details);
                                if (details && details.length > 0) {
                                    errorHtml = '<div class="mt-2 space-y-1">' + details.slice(0, 5).map(d => 
                                        \`<div class="text-xs"><span class="text-red-600">\u2022 \${d.studentName} (\${d.studentId}): \${d.error}</span> <a href="\${d.memoUrl}" target="_blank" class="text-blue-600 hover:underline"><i class="fas fa-external-link-alt"></i> \u30e1\u30e2\u3092\u958b\u304f</a></div>\`
                                    ).join('');
                                    if (details.length > 5) errorHtml += \`<div class="text-xs text-gray-500">\u2022 ... \u4ed6\${details.length - 5}\u4ef6</div>\`;
                                    errorHtml += '</div>';
                                }
                            } catch (e) {
                                if (log.error_message) {
                                    const errors = log.error_message.split('; ').filter(e => e.trim());
                                    errorHtml = '<div class="mt-2 space-y-1">' + errors.slice(0, 5).map(err => \`<div class="text-xs text-red-600">\u2022 \${err}</div>\`).join('');
                                    if (errors.length > 5) errorHtml += \`<div class="text-xs text-gray-500">\u2022 ... \u4ed6\${errors.length - 5}\u4ef6</div>\`;
                                    errorHtml += '</div>';
                                }
                            }
                        } else if (log.error_message) {
                            const errors = log.error_message.split('; ').filter(e => e.trim());
                            errorHtml = '<div class="mt-2 space-y-1">' + errors.slice(0, 5).map(err => \`<div class="text-xs text-red-600">\u2022 \${err}</div>\`).join('');
                            if (errors.length > 5) errorHtml += \`<div class="text-xs text-gray-500">\u2022 ... \u4ed6\${errors.length - 5}\u4ef6</div>\`;
                            errorHtml += '</div>';
                        }
                        
                        return \`
                            <div class="flex items-start space-x-3 p-3 border border-gray-200 rounded \${log.inactive_count > 0 ? 'bg-red-50 border-red-300' : ''}">
                                <i class="fas \${statusIcon} mt-1"></i>
                                <div class="flex-1">
                                    <p class="text-sm text-gray-900">
                                        \${jstDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} (JST) - 
                                        <span class="font-medium">\${log.channels_checked}</span>\u500b\u30c1\u30a7\u30c3\u30af\u3001
                                        <span class="font-medium \${log.inactive_count > 0 ? 'text-red-600' : 'text-green-600'}">\${log.inactive_count || 0}\u500b</span>\u66f4\u65b0\u505c\u6b62\u3001
                                        <span class="font-medium text-blue-600">\${log.alerts_sent}</span>\u4ef6\u901a\u77e5
                                    </p>
                                    \${errorHtml}
                                </div>
                            </div>
                        \`;
                    }).join('');
                } catch (error) {
                    console.error('Error loading logs:', error);
                }
            }
            // Load available servers (Bot joined)
            async function loadAvailableServers() {
                try {
                    const response = await axios.get('/api/servers/available');
                    const guilds = response.data.guilds;
                    
                    // Get registered servers
                    const registeredResponse = await axios.get('/api/servers');
                    const registeredIds = new Set(registeredResponse.data.servers.map(s => s.id));
                    
                    const listEl = document.getElementById('availableServerList');
                    if (guilds.length === 0) {
                        listEl.innerHTML = '<p class="text-gray-500 text-center py-8">Botが参加しているサーバーがありません</p>';
                        return;
                    }
                    
                    listEl.innerHTML = guilds.map(guild => {
                        const isRegistered = registeredIds.has(guild.id);
                        return \`
                            <div class="flex items-center justify-between p-3 border border-gray-200 rounded hover:bg-gray-50">
                                <div class="flex items-center space-x-3">
                                    <i class="fab fa-discord text-indigo-600 text-lg"></i>
                                    <div>
                                        <p class="text-sm font-medium text-gray-900">\${guild.name}</p>
                                        <p class="text-xs text-gray-500">\${guild.id}</p>
                                    </div>
                                </div>
                                \${isRegistered ? 
                                    '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">登録済み</span>' :
                                    \`<button onclick="addServerById('\${guild.id}', '\${guild.name.replace(/'/g, "\\\\'")}') " class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded transition">登録</button>\`
                                }
                            </div>
                        \`;
                    }).join('');
                } catch (error) {
                    console.error('Error loading available servers:', error);
                    document.getElementById('availableServerList').innerHTML = 
                        '<p class="text-red-500 text-center py-8">サーバー一覧の取得に失敗しました</p>';
                }
            }

            // Add server by ID directly
            async function addServerById(serverId, serverName) {
                if (!confirm(\`「\${serverName}」を監視対象に追加しますか？\`)) return;
                
                try {
                    await axios.post('/api/servers', { serverId });
                    alert('サーバーを追加しました: ' + serverName);
                    loadServers();
                    loadStats();
                    loadAvailableServers();
                } catch (error) {
                    alert('エラー: ' + (error.response?.data?.error || error.message));
                }
            }

            // Run monitor manually
            async function runMonitor() {
                const btn = document.getElementById('runBtn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>実行中...</span>';
                
                try {
                    const response = await axios.post('/api/monitor/run');
                    const inactiveList = response.data.inactiveChannels.map(ch => 
                        \`- \${ch.serverName} / #\${ch.channelName}\`
                    ).join('\\n');
                    
                    alert(\`監視完了（Slack通知送信済み）\\n\\nチェック: \${response.data.channelsChecked}個\\n通知: \${response.data.alertsSent}件\\n\\n更新停止チャンネル:\\n\${inactiveList || 'なし'}\`);
                    loadStats();
                    loadLogs();
                } catch (error) {
                    alert('エラー: ' + (error.response?.data?.error || error.message));
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-play"></i><span>本番実行</span>';
                }
            }

            // Run monitor in test mode (no Slack notification)
            async function runMonitorTest() {
                const btn = document.getElementById('testBtn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>実行中...</span>';
                
                try {
                    const response = await axios.post('/api/monitor/test');
                    const inactiveList = response.data.inactiveChannels.map(ch => 
                        \`- \${ch.serverName} / #\${ch.channelName} (最終更新: \${ch.lastMessageAt ? new Date(ch.lastMessageAt).toLocaleString('ja-JP') : '不明'})\`
                    ).join('\\n');
                    
                    alert(\`テスト完了（Slack通知なし）\\n\\nチェック: \${response.data.channelsChecked}個\\n更新停止: \${response.data.inactiveChannels.length}件\\n\\n更新停止チャンネル:\\n\${inactiveList || 'なし'}\`);
                    loadStats();
                    loadLogs();
                } catch (error) {
                    alert('エラー: ' + (error.response?.data?.error || error.message));
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

// Get all servers
app.get('/api/servers', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT id, name, added_at FROM servers ORDER BY added_at DESC'
  ).all();
  
  return c.json({ servers: result.results || [] });
});

// Get bot's available servers
app.get('/api/servers/available', async (c) => {
  const discord = new DiscordClient(c.env.DISCORD_BOT_TOKEN);
  
  try {
    const guilds = await discord.getBotGuilds();
    return c.json({ guilds });
  } catch (error) {
    console.error('Error fetching bot guilds:', error);
    return c.json({ error: 'Botのサーバー一覧取得に失敗しました' }, 500);
  }
});

// Add a server
app.post('/api/servers', async (c) => {
  const { serverId } = await c.req.json();
  
  if (!serverId) {
    return c.json({ error: 'サーバーIDが必要です' }, 400);
  }
  
  // Fetch server info from Discord
  const discord = new DiscordClient(c.env.DISCORD_BOT_TOKEN);
  
  try {
    const guild = await discord.getGuild(serverId);
    
    // Insert into database
    await c.env.DB.prepare(
      'INSERT INTO servers (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name'
    ).bind(serverId, guild.name).run();
    
    return c.json({ id: serverId, name: guild.name });
  } catch (error) {
    console.error('Discord API Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('403')) {
      return c.json({ 
        error: 'Botに権限がありません。Botがサーバーのメンバーであり、適切な権限が付与されていることを確認してください。' 
      }, 400);
    } else if (errorMessage.includes('404')) {
      return c.json({ 
        error: 'サーバーが見つかりません。サーバーIDが正しいか、Botがそのサーバーに参加しているか確認してください。' 
      }, 400);
    } else if (errorMessage.includes('401')) {
      return c.json({ 
        error: 'Bot認証エラー。Discord Bot Tokenが正しく設定されているか確認してください。' 
      }, 400);
    } else {
      return c.json({ 
        error: `サーバー情報の取得に失敗: ${errorMessage}` 
      }, 400);
    }
  }
});

// Delete a server
app.delete('/api/servers/:id', async (c) => {
  const serverId = c.req.param('id');
  
  await c.env.DB.prepare('DELETE FROM servers WHERE id = ?').bind(serverId).run();
  
  return c.json({ success: true });
});

// Get stats
app.get('/api/stats', async (c) => {
  const serverCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM servers').first();
  const channelCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM channels').first();
  const lastCheck = await c.env.DB.prepare('SELECT checked_at FROM check_logs ORDER BY checked_at DESC LIMIT 1').first();
  
  return c.json({
    serverCount: serverCount?.count || 0,
    channelCount: channelCount?.count || 0,
    lastCheck: lastCheck?.checked_at || null,
  });
});

// Get logs
app.get('/api/logs', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT * FROM check_logs ORDER BY inactive_count DESC, checked_at DESC LIMIT 50'
  ).all();
  
  return c.json({ logs: result.results || [] });
});

// Run monitor manually
app.post('/api/monitor/run', async (c) => {
  const result = await monitorChannels(c.env as Env);
  return c.json(result);
});

// Run monitor in test mode (no Slack notification)
app.post('/api/monitor/test', async (c) => {
  const result = await monitorChannels(c.env as Env, { skipSlackNotification: true });
  return c.json(result);
});

// =====================================
// Scheduled Cron Job (Daily at 17:00 JST)
// =====================================

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    // Run the monitor
    ctx.waitUntil(monitorChannels(env as Env));
  },
};
