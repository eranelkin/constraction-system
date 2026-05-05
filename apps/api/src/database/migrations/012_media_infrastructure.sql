CREATE TABLE media_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key   TEXT NOT NULL,
  url           TEXT NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  size_bytes    INTEGER,
  duration_secs SMALLINT,
  uploaded_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type   VARCHAR(50),
  entity_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX media_files_uploaded_by_idx ON media_files(uploaded_by);
CREATE INDEX media_files_entity_idx ON media_files(entity_type, entity_id);

CREATE TABLE settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO settings (key, value) VALUES
  ('video_max_duration_seconds', '12'),
  ('video_quality', '0.4');
