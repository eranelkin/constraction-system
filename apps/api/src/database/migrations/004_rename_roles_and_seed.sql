-- Migration 004: rename roles client→manager, contractor→member

ALTER TABLE users DROP CONSTRAINT users_role_check;
UPDATE users SET role = 'manager' WHERE role = 'client';
UPDATE users SET role = 'member'  WHERE role = 'contractor';
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'member'));
