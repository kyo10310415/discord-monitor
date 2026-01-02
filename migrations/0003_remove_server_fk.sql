-- Remove foreign key constraint from channels table
-- Recreate table without foreign key
CREATE TABLE IF NOT EXISTS channels_new (
  id TEXT PRIMARY KEY,
  server_id TEXT,
  name TEXT NOT NULL,
  student_name TEXT,
  student_id TEXT,
  memo_url TEXT,
  last_message_at TEXT,
  last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table
INSERT INTO channels_new SELECT * FROM channels;

-- Drop old table
DROP TABLE channels;

-- Rename new table
ALTER TABLE channels_new RENAME TO channels;

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_channels_server_id ON channels(server_id);
