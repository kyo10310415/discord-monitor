# Discord Channel Monitor - スプレッドシート連携版

## セキュリティ修正後のNode.js版の利用手順

現在の `src/index.ts` はNode.js + SQLite版です。下記のCloudflare/D1の説明は旧構成の記録であり、現行の認証設定・ヘルスチェックはこの節を優先してください。

### 必須のアクセス設定（値をGitへ保存しない）

- `MONITOR_ADMIN_USERNAME`: 管理者のユーザー名（英数字と `_ . @ -`、100文字以内）。
- `MONITOR_ADMIN_PASSWORD`: 独立して安全に生成した32文字以上の管理者パスワード。
- `MONITOR_JOB_TOKEN`: 上記パスワードとは異なる、独立して安全に生成した32文字以上の定期ジョブ専用トークン。
- `MONITOR_PUBLIC_ORIGIN`: ブラウザから開く正規のHTTPS origin（例: `https://monitor.example.invalid`）。パスやクエリは指定しない。ローカル開発のみ `http://localhost:3000` 等を許可。

必要項目がない・短い秘密値・同一のパスワードとトークン・不正なoriginでは、HTTP待受けとDB初期化より前に起動を拒否します。秘密値の既定値はありません。環境変数はホストの秘密設定で管理し、値をログや画面に表示しないでください。Node.js版は環境変数を直接読み、`.dev.vars`の自動読込みはしません。

### 管理画面とAPI

管理画面 `/` と全管理APIは管理者専用のHTTP Basic認証です。正規のHTTPS URLを開き、ブラウザの認証ダイアログへ管理者の資格情報を入力します。既存の手動実行ボタンはその認証を使います。共有PCでは資格情報を保存せず、利用終了時はブラウザを終了してください。本修正では個人別アカウント・MFA・SSO登録の新規運用は導入していません。

管理用POSTは `X-Monitor-Request: 1` を必須とし、Originがある場合は `MONITOR_PUBLIC_ORIGIN` と完全一致を要求します。外部サイト用CORS許可はありません。管理画面はこのヘッダーを自動付与します。管理者がCLIから呼ぶ場合もBasic認証とこのヘッダーが必要です。

- `GET /health` のみ認証なしで利用可能（固定の稼働状態のみ）。Renderのヘルスチェックをこのパスに設定する。
- `GET /api/stats`、`GET /api/logs` は認証された管理者のみ。
- `POST /api/monitor/run`、`POST /api/monitor/test` は認証された管理者のみ。
- `POST /api/jobs/monitor` は専用の `Authorization: Bearer …` のみ受理する。このトークンで管理画面・統計・ログを読めない。

ログAPIは時刻・件数・状態の必要なサマリだけを返します。氏名・学籍番号・メモURL・生の例外・`channel_details`は返しません。手動/定期実行の応答も `channelsChecked`、`alertsSent`、`inactiveCount`、`errorCount` のみです。個別の通知情報は権限を設定したSlack通知先等で確認してください。既存のDB記録は削除していません。ログの実閲覧権限・保持期間は所有者が別途確認してください。

### 定期ジョブの切替

GitHub ActionsのリポジトリSecret `MONITOR_JOB_TOKEN` に、サービス側の同名設定と同じトークンを設定します。任意のrepository variable `MONITOR_BASE_URL` で正規のサービスURLを指定できます。workflowは専用ジョブAPIにだけトークンを送り、応答全文をログへ出しません。従来の匿名POST呼出しは拒否されるため、外部のスケジューラにも同じ切替が必要です。サービス内部のcronはHTTPを経由せず従来どおり動きます。

**このコード修正だけではホスト/Actionsの設定は変わりません。** 適用前に所有者が上記設定とHTTPSを準備してください。監査・修正時には本番設定変更や本番へのAPI呼出しは行っていません。

### 検証とロールバック

`npm test` は外部API・DB・cron・HTTP待受けを起動しないmockテストです。匿名拒否、管理者認証、CSRF拒否、ジョブ権限の分離、個人情報を含まない応答を検証します。`npm run build` で型検査を行います。

依存定義には既存の `better-sqlite3` manifest/Lockfile不整合があり、通常の `npm ci` は失敗します。この修正では依存版・Lockfileを更新していません。次の承認済み依存保守で整合とネイティブモジュール互換性を検証してください。

コードを戻す場合も匿名APIを外部公開しないでください。前のコードを使う必要がある場合は先にサービスを公開停止または上流認証で隔離します。秘密値を切替えた後は漏洩した旧値へ戻さず新しい値で再切替します。DBスキーマ変更はありません。旧コード・設定へ戻す前に、ヘルスチェック/Actions呼出し先と認証の整合も確認してください。

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
npm ci

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

## Node.js・再現可能な依存導入（SEC-034/035）

実行版はNode.js 22.23.4（22系の同版以上）です。.node-versionとRender定義を更新し、package.jsonにも>=22.23.4 <23を指定しています。RenderでNODE_VERSIONを別途設定している場合は同版にそろえ、デプロイログで実版を確認してください。

依存導入はnpm ciを使用します。以前のlockfileはbetter-sqlite3 9系・tsxのdev配置等がmanifestと一致していませんでした。既存manifestのbetter-sqlite3 12系とruntime tsxを維持してlockfileを再生成し、@types/nodeを22系へ合わせました。DBスキーマ・認証設定は変更していません。better-sqlite3のnativeバイナリは新実行版/配備OSに合わせた再導入が必要です。

隔離検証はnpm ci --ignore-scriptsで行い、native install scriptは実行していません。アクセス制御の6回帰テストと型ビルドを確認します。実SQLiteの読書き・本番Discord/Google通信は別途認証後の検証対象です。
