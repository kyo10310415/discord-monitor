-- Add channel_details column to store detailed error information with links
ALTER TABLE check_logs ADD COLUMN channel_details TEXT;
