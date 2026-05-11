-- Replace base64 photo storage with a URL reference.
-- Existing base64 photo data is not migrated (early-stage data loss accepted).
ALTER TABLE field_reports
  DROP COLUMN IF EXISTS photo_base64,
  DROP COLUMN IF EXISTS photo_mime_type,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;
