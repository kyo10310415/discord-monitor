-- Add student information to channels table
ALTER TABLE channels ADD COLUMN student_name TEXT;
ALTER TABLE channels ADD COLUMN student_id TEXT;
ALTER TABLE channels ADD COLUMN memo_url TEXT;
