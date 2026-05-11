-- field_reports.reported_by, schedule_tasks.created_by, rfis.created_by were defined as
-- NOT NULL ... ON DELETE SET NULL — a constraint conflict that causes user deletes to fail.
-- Drop NOT NULL so PostgreSQL can set these to NULL when the referenced user is deleted.
ALTER TABLE field_reports  ALTER COLUMN reported_by DROP NOT NULL;
ALTER TABLE schedule_tasks ALTER COLUMN created_by  DROP NOT NULL;
ALTER TABLE rfis           ALTER COLUMN created_by  DROP NOT NULL;
