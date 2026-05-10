CREATE INDEX IF NOT EXISTS idx_messages_sender_id          ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type          ON conversations(type);
CREATE INDEX IF NOT EXISTS idx_field_reports_reported_by   ON field_reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_rfis_created_by             ON rfis(created_by);
CREATE INDEX IF NOT EXISTS idx_rfis_assigned_to            ON rfis(assigned_to);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_created_by   ON schedule_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id      ON group_members(group_id);
