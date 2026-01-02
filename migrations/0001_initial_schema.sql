-- Discord servers table
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Monitored channels table
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  last_message_at DATETIME,
  last_checked_at DATETIME,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

-- Check logs table
CREATE TABLE IF NOT EXISTS check_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  channels_checked INTEGER DEFAULT 0,
  alerts_sent INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success',
  error_message TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_channels_server_id ON channels(server_id);
CREATE INDEX IF NOT EXISTS idx_channels_last_message ON channels(last_message_at);
CREATE INDEX IF NOT EXISTS idx_check_logs_checked_at ON check_logs(checked_at);
