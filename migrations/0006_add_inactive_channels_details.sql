-- Add inactive_channels_details column to store inactive channel information
ALTER TABLE check_logs ADD COLUMN inactive_channels_details TEXT;
