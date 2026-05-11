-- messages.sender_id: allow NULL so messages survive user deletion
ALTER TABLE messages
  DROP CONSTRAINT messages_sender_id_fkey,
  ALTER COLUMN sender_id DROP NOT NULL,
  ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;

-- jobs.client_id: allow NULL so job records survive creator deletion
ALTER TABLE jobs
  DROP CONSTRAINT jobs_client_id_fkey,
  ALTER COLUMN client_id DROP NOT NULL,
  ADD CONSTRAINT jobs_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE SET NULL;

-- jobs.assigned_contractor_id: already nullable, just adds cascade rule
ALTER TABLE jobs
  DROP CONSTRAINT jobs_assigned_contractor_id_fkey,
  ADD CONSTRAINT jobs_assigned_contractor_id_fkey
    FOREIGN KEY (assigned_contractor_id) REFERENCES users(id) ON DELETE SET NULL;

-- job_applications.contractor_id: allow NULL so application history survives user deletion
ALTER TABLE job_applications
  DROP CONSTRAINT job_applications_contractor_id_fkey,
  ALTER COLUMN contractor_id DROP NOT NULL,
  ADD CONSTRAINT job_applications_contractor_id_fkey
    FOREIGN KEY (contractor_id) REFERENCES users(id) ON DELETE SET NULL;
