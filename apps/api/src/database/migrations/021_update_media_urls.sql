-- Media files were previously served unauthenticated via /uploads/*.
-- They are now served via the authenticated /media/serve/* endpoint.
-- Update all stored URLs across every table that references them.
UPDATE media_files
  SET url = replace(url, '/uploads/', '/media/serve/')
  WHERE url LIKE '/uploads/%';

UPDATE messages
  SET audio_url = replace(audio_url, '/uploads/', '/media/serve/')
  WHERE audio_url LIKE '/uploads/%';

UPDATE messages
  SET video_url = replace(video_url, '/uploads/', '/media/serve/')
  WHERE video_url LIKE '/uploads/%';

UPDATE field_reports
  SET photo_url = replace(photo_url, '/uploads/', '/media/serve/')
  WHERE photo_url LIKE '/uploads/%';
