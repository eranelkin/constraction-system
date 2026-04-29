CREATE TABLE IF NOT EXISTS jobs (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              UUID        NOT NULL REFERENCES users(id),
  title                  TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description            TEXT        NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  budget                 NUMERIC(12,2) NOT NULL CHECK (budget > 0),
  location               TEXT        NOT NULL,
  status                 TEXT        NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'assigned', 'completed', 'cancelled')),
  assigned_contractor_id UUID        REFERENCES users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_applications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  contractor_id UUID        NOT NULL REFERENCES users(id),
  cover_note    TEXT        NOT NULL CHECK (char_length(cover_note) BETWEEN 1 AND 1000),
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, contractor_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_client_id      ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status         ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_apps_job_id     ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_apps_contractor ON job_applications(contractor_id);

CREATE OR REPLACE FUNCTION fn_touch_job_on_application()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE jobs SET updated_at = NOW() WHERE id = NEW.job_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_touch_job_on_application
AFTER INSERT ON job_applications
FOR EACH ROW EXECUTE FUNCTION fn_touch_job_on_application();
