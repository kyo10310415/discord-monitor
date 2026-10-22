export const dashboardHtml = `
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
            axios.defaults.headers.common['X-Monitor-Request'] = '1';
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

            function formatDate(dateStr) {
                if (!dateStr) return '不明';
                const date = new Date(dateStr);
                const now = new Date();
                const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
                const dateLabel = date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
                if (diffDays === 0) return \`今日 (\${dateLabel})\`;
                if (diffDays === 1) return \`昨日 (\${dateLabel})\`;
                return \`\${diffDays}日前 (\${dateLabel})\`;
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
                    listEl.innerHTML = logs.map((log, idx) => {
                        const statusIcon = log.status === 'success' ? 'fa-check-circle text-green-600' :
                                          log.status === 'error'   ? 'fa-times-circle text-red-600' :
                                                                     'fa-exclamation-circle text-yellow-600';
                        const date = new Date(log.checked_at);
                        const dateStr = date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

                        const inactiveCount = log.inactive_count;

                        return \`
                            <div class="p-3 border border-gray-200 rounded">
                                <div class="flex items-start space-x-3">
                                    <i class="fas \${statusIcon} mt-1 flex-shrink-0"></i>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm text-gray-900">
                                            \${dateStr} (JST) &nbsp;|&nbsp;
                                            <span class="font-medium">\${log.channels_checked}</span>個チェック &nbsp;|&nbsp;
                                            <span class="font-medium text-orange-600">\${inactiveCount}</span>件更新停止 &nbsp;|&nbsp;
                                            <span class="font-medium text-indigo-600">\${log.alerts_sent}</span>件Slack通知
                                        </p>
                                        <p class="text-xs text-gray-600 mt-1">エラー: \${log.error_count}件（個別情報は通知先で確認）</p>
                                    </div>
                                </div>
                            </div>
                        \`;
                    }).join('');
                } catch (e) { console.error(e); }
            }

            function toggleDetail(id) {
                const el = document.getElementById(id);
                const icon = document.getElementById('icon-' + id);
                if (!el) return;
                const isHidden = el.classList.contains('hidden');
                el.classList.toggle('hidden');
                if (icon) icon.style.transform = isHidden ? 'rotate(90deg)' : '';
            }

            async function runMonitor() {
                const btn = document.getElementById('runBtn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>実行中...</span>';
                try {
                    const response = await axios.post('/api/monitor/run');
                    alert(\`監視完了（Slack通知送信済み）\\n\\nチェック: \${response.data.channelsChecked}個\\n通知: \${response.data.alertsSent}件\\n更新停止: \${response.data.inactiveCount}件\\nエラー: \${response.data.errorCount}件\`);
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
                    alert(\`テスト完了（Slack通知なし）\\n\\nチェック: \${response.data.channelsChecked}個\\n通知: \${response.data.alertsSent}件\\n更新停止: \${response.data.inactiveCount}件\\nエラー: \${response.data.errorCount}件\`);
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
  `;
