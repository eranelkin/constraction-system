ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_send_voice BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send_video BOOLEAN NOT NULL DEFAULT false;

UPDATE users SET can_send_voice = true, can_send_video = true WHERE role = 'admin';
