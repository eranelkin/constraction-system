CREATE TABLE IF NOT EXISTS message_translations (
  message_id      UUID         NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  language        VARCHAR(10)  NOT NULL,
  translated_body TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, language)
);

CREATE INDEX IF NOT EXISTS idx_msg_translations_message_id
  ON message_translations(message_id);
