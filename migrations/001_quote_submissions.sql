-- Quote form submissions. A row is written before the visitor sees the
-- confirmation page, so a lead survives any failure further down the line.
CREATE TABLE IF NOT EXISTS quote_submissions (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_on  TEXT NOT NULL,          -- New York calendar date, the key GigFriend dedupes on with the email
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  event_date    TEXT NOT NULL DEFAULT '',
  referral      TEXT NOT NULL DEFAULT '',
  venue         TEXT NOT NULL DEFAULT '',
  details       TEXT NOT NULL DEFAULT '',
  services      TEXT NOT NULL DEFAULT '',   -- comma separated
  ip            TEXT NOT NULL DEFAULT '',
  -- delivery state for each downstream step: pending, sent, failed
  intake_state  TEXT NOT NULL DEFAULT 'pending',
  email_state   TEXT NOT NULL DEFAULT 'pending',
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_try_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error    TEXT NOT NULL DEFAULT '',
  alerted       BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS quote_files (
  id            BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES quote_submissions(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  mime          TEXT NOT NULL,
  bytes         BYTEA NOT NULL
);

CREATE INDEX IF NOT EXISTS quote_submissions_due ON quote_submissions (next_try_at)
  WHERE intake_state <> 'sent' OR email_state <> 'sent';
