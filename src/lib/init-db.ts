import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || './data/discord-monitor.db';

export function getDb(): Database.Database {
  // データディレクトリを作成
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');
  return db;
}

export function initDb(): void {
  const db = getDb();

  // マイグレーションファイルのパス
  const migrationsDir = path.resolve(__dirname, '../../migrations');

  // d_migrationsテーブルを作成（適用済み管理）
  db.exec(`
    CREATE TABLE IF NOT EXISTS d_migrations (
      name TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // マイグレーションファイルを順番に適用
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const applied = db.prepare('SELECT name FROM d_migrations WHERE name = ?').get(file);
    if (!applied) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      db.exec(sql);
      db.prepare('INSERT INTO d_migrations (name) VALUES (?)').run(file);
      console.log(`✅ Migration applied: ${file}`);
    }
  }

  console.log('✅ Database initialized');
  db.close();
}

// 直接実行された場合のみマイグレーション実行（importされた場合は実行しない）
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  initDb();
}
