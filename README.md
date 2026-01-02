# Discord Channel Monitor - スプレッドシート連携版

Googleスプレッドシートから監視対象を取得し、2日間以上更新がないDiscordチャンネルをSlackに通知するシステムです。

## 🌐 Web管理画面

**ローカル開発URL**: http://localhost:3000

## 📋 機能

### 完成済み機能
- ✅ Googleスプレッドシート連携（Google Sheets API）
- ✅ スプレッドシートからチャンネルURL自動取得
- ✅ Discord Botによるチャンネル監視
- ✅ 2日間以上更新がないチャンネルを検出
- ✅ Slack通知（生徒名・学籍番号・メモURL付き）
- ✅ Web管理画面（統計・ログ表示）
- ✅ 手動監視実行機能（テストモード・本番モード）
- ✅ Cron自動実行（毎日17時 JST）

### 監視対象
- Googleスプレッドシート「メモ_URL」シートのC列（メモURL）に記載されたチャンネル
- A列: 生徒名
- B列: 学籍番号
- C列: メモURL（Discord チャンネルURL）

### 通知内容
- 生徒名・学籍番号
- 最終更新日時
- チャンネルへの直接リンクURL

## 🏗️ アーキテクチャ

```
┌─────────────────────────────────────────┐
│   Cloudflare Worker (Cron Trigger)      │
│   - 定期実行（毎日17時 JST）            │
│   - Google Sheets からデータ取得        │
│   - Discord API でメッセージ確認        │
│   - Slack へ通知送信                    │
└─────────────────────────────────────────┘
            ↓                    ↓
┌──────────────────┐    ┌─────────────────┐
│ Google Sheets    │    │ Cloudflare D1   │
│ - 監視対象リスト │    │ - チャンネル情報│
│ - 生徒情報       │    │ - 監視ログ      │
└──────────────────┘    └─────────────────┘
```

## 🗄️ データモデル

### channels テーブル
- `id`: チャンネルID（主キー）
- `server_id`: サーバーID
- `name`: チャンネル名
- `last_message_at`: 最終メッセージ日時
- `last_checked_at`: 最終チェック日時
- `student_name`: 生徒名
- `student_id`: 学籍番号
- `memo_url`: メモURL

### check_logs テーブル
- `id`: ログID（主キー）
- `checked_at`: チェック実行日時
- `channels_checked`: チェックしたチャンネル数
- `alerts_sent`: 送信した通知数
- `status`: ステータス（success/partial/error）
- `error_message`: エラーメッセージ

## 📱 使い方

### ローカル開発

```bash
# 1. 依存関係のインストール
npm install

# 2. 環境変数の設定（.dev.vars）
DISCORD_BOT_TOKEN=your-discord-token
SLACK_WEBHOOK_URL=your-slack-webhook-url
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SHEET_NAME=メモ_URL

# 3. データベースのマイグレーション
npm run db:migrate:local

# 4. ビルド
npm run build

# 5. 開発サーバー起動
pm2 start ecosystem.config.cjs
```

## 🚀 本番デプロイ手順（Cloudflare Pages）

### ステップ1: Cloudflare認証設定

```bash
# Deploy タブでCloudflare API Keyを設定
# または以下のツールを実行
setup_cloudflare_api_key
```

### ステップ2: D1データベース作成

```bash
# 1. 本番用データベースを作成
npx wrangler d1 create discord-monitor-db

# 2. 出力されたdatabase_idをwrangler.jsonc に設定
# "database_id": "出力されたID"

# 3. マイグレーション適用
npm run db:migrate:prod
```

### ステップ3: Cloudflare Secrets設定

```bash
# Discord Bot Token
npx wrangler pages secret put DISCORD_BOT_TOKEN
# 入力: your-discord-bot-token

# Slack Webhook URL
npx wrangler pages secret put SLACK_WEBHOOK_URL
# 入力: your-slack-webhook-url

# Google Service Account Email
npx wrangler pages secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
# 入力: discord-monitor@discord-monitor-482816.iam.gserviceaccount.com

# Google Private Key（重要: 改行を含む完全なキー）
npx wrangler pages secret put GOOGLE_PRIVATE_KEY
# 入力: -----BEGIN PRIVATE KEY-----
# MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCXy/6QrBwomjB+
# ...（全ての行を貼り付け）...
# qjdfH0XFUKiG6bG5gzV3hNUd
# -----END PRIVATE KEY-----

# Google Spreadsheet ID
npx wrangler pages secret put GOOGLE_SPREADSHEET_ID
# 入力: 1lqgBb2PIZpyQXMHZpqAjxB-iwNTt7PZxWVUz_EdNFVY

# Google Sheet Name
npx wrangler pages secret put GOOGLE_SHEET_NAME
# 入力: メモ_URL
```

### ステップ4: プロジェクト名の管理

```bash
# meta_infoツールを使用してCloudflareプロジェクト名を管理
meta_info(action="read", key="cloudflare_project_name")
# デフォルト: discord-monitor

# 必要に応じて変更
meta_info(action="write", key="cloudflare_project_name", value="discord-monitor")
```

### ステップ5: Cloudflare Pages Project作成

```bash
# Pagesプロジェクトを作成（main ブランチを本番ブランチとして使用）
npx wrangler pages project create discord-monitor \
  --production-branch main \
  --compatibility-date 2025-12-30
```

### ステップ6: ビルドとデプロイ

```bash
# 1. ビルド
npm run build

# 2. デプロイ
npx wrangler pages deploy dist --project-name discord-monitor

# デプロイ成功後、以下のURLが表示されます:
# - Production: https://discord-monitor.pages.dev
# - Branch: https://main.discord-monitor.pages.dev
```

### ステップ7: デプロイ後の確認

```bash
# 1. デプロイされたURLにアクセス
# https://discord-monitor.pages.dev

# 2. Web管理画面で「テスト実行」ボタンをクリック

# 3. 動作確認後、meta_infoに最終プロジェクト名を保存
meta_info(action="write", key="cloudflare_project_name", value="discord-monitor")
```

## 🔧 技術スタック

- **バックエンド**: Hono (Cloudflare Workers)
- **データベース**: Cloudflare D1 (SQLite)
- **フロントエンド**: Vanilla JS + TailwindCSS
- **外部API**: 
  - Discord API v10
  - Slack Incoming Webhooks
  - Google Sheets API v4
- **デプロイ**: Cloudflare Pages

## 📊 API エンドポイント

### 統計情報
- `GET /api/stats` - 統計情報取得（チャンネル数、最終チェック時刻）
- `GET /api/logs` - 監視ログ取得

### 監視実行
- `POST /api/monitor/run` - 本番実行（Slack通知あり）
- `POST /api/monitor/test` - テスト実行（Slack通知なし）

## ⚙️ 環境変数

### 必須
- `DISCORD_BOT_TOKEN`: Discord Bot認証トークン
- `SLACK_WEBHOOK_URL`: Slack Incoming Webhook URL
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google Service Accountメールアドレス
- `GOOGLE_PRIVATE_KEY`: Google Service Account秘密鍵
- `GOOGLE_SPREADSHEET_ID`: GoogleスプレッドシートID
- `GOOGLE_SHEET_NAME`: シート名（デフォルト: メモ_URL）

### Cloudflare Bindings
- `DB`: D1 Database (discord-monitor-db)

## 🔐 セキュリティ

### Google Sheets API認証
- Service Account認証を使用
- スプレッドシートに Service Account のメールアドレスを共有設定
- 権限: 閲覧者

### Secret管理
- 全ての認証情報はCloudflare Secretsに保存
- ローカル開発では`.dev.vars`ファイル使用（.gitignore済み）

## 📝 注意事項

### Google Sheets API
- Service Accountのメールアドレスをスプレッドシートの共有設定に追加必須
- 権限は「閲覧者」でOK

### Discord API レート制限
- グローバルレート制限: 50リクエスト/秒
- チャンネルごと: 5リクエスト/秒

### Cloudflare Workers制限
- CPU時間: 10ms（無料プラン）/50ms（有料プラン）
- リクエストサイズ: 100MB

## 🐛 トラブルシューティング

### スプレッドシートにアクセスできない
- Service Accountのメールアドレスが共有設定に追加されているか確認
- スプレッドシートIDが正しいか確認
- シート名が正しいか確認（日本語の場合は正確に）

### Discord Botがチャンネルにアクセスできない
- Botが該当サーバーのメンバーになっているか確認
- Bot権限（View Channels, Read Message History）が正しく設定されているか確認

### Slack通知が届かない
- Webhook URLが正しいか確認
- Slackワークスペースとチャンネルが有効か確認

### Cronが実行されない
- Cloudflare Pagesにデプロイ済みか確認
- wrangler.jsonc の crons 設定を確認（"0 8 * * *" = 毎日UTC 08:00 = JST 17:00）

## 📄 ライセンス

MIT License

---

**最終更新**: 2026-01-02
**デプロイステータス**: ✅ ローカルテスト完了
