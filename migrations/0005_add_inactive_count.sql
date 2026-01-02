-- Add inactive_count column to check_logs
ALTER TABLE check_logs ADD COLUMN inactive_count INTEGER DEFAULT 0;
