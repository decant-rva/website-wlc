-- One row per New York day on which the "still undelivered" summary was sent, so a restart
-- or a second machine sends it at most once a day.
CREATE TABLE IF NOT EXISTS quote_daily_summary (
  day      TEXT PRIMARY KEY,
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
