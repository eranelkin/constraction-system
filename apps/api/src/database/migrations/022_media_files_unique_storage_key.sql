-- ON CONFLICT (storage_key) requires a unique constraint
ALTER TABLE media_files ADD CONSTRAINT media_files_storage_key_key UNIQUE (storage_key);
