-- Allow empty body when message carries audio or video media
ALTER TABLE messages DROP CONSTRAINT messages_body_check;
ALTER TABLE messages ADD CONSTRAINT messages_body_check
  CHECK (
    char_length(body) <= 4000 AND
    (char_length(body) > 0 OR audio_url IS NOT NULL OR video_url IS NOT NULL)
  );
