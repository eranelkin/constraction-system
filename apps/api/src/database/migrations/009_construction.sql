-- Field reports
CREATE TABLE field_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        VARCHAR(20) NOT NULL CHECK (type IN ('progress','issue','delay','safety')),
  project     VARCHAR(200) NOT NULL,
  location    VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  reported_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX field_reports_status_idx ON field_reports(status);
CREATE INDEX field_reports_type_idx   ON field_reports(type);
CREATE INDEX field_reports_created_at_idx ON field_reports(created_at DESC);

-- Schedule tasks / delay log
CREATE TABLE schedule_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name   VARCHAR(300) NOT NULL,
  project     VARCHAR(200) NOT NULL,
  planned_date DATE NOT NULL,
  delay_days  INTEGER NOT NULL DEFAULT 0,
  status      VARCHAR(20) NOT NULL DEFAULT 'on-track' CHECK (status IN ('on-track','delayed','critical','complete')),
  reason      TEXT,
  impact      TEXT,
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX schedule_tasks_status_idx ON schedule_tasks(status);
CREATE INDEX schedule_tasks_created_at_idx ON schedule_tasks(created_at DESC);

-- RFIs (Requests for Information)
CREATE SEQUENCE rfi_number_seq START 1;

CREATE TABLE rfis (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number      INTEGER NOT NULL DEFAULT nextval('rfi_number_seq') UNIQUE,
  title       VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  priority    VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status      VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in-review','answered','closed')),
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date    DATE,
  response    TEXT,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX rfis_status_idx   ON rfis(status);
CREATE INDEX rfis_priority_idx ON rfis(priority);
CREATE INDEX rfis_created_at_idx ON rfis(created_at DESC);
