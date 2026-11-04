-- Transactional email and single-use account tokens. Additive only.
-- Emails are written to the outbox inside the transaction that caused them, so a rolled-back
-- order never sends a "paid" email, and a provider outage only delays delivery.
--
-- Down (manual; the runner is forward-only):
--   DROP TABLE account_tokens; DROP TABLE email_outbox;

CREATE TABLE email_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email         text NOT NULL,
  reply_to         text,
  template         text NOT NULL,
  subject          text NOT NULL,
  body             text NOT NULL,                 -- cleared after a real send: it can hold reset links
  dedupe_key       text UNIQUE,                   -- e.g. one payment email per order
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts         int NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text,
  provider_id      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);
CREATE INDEX email_outbox_due_idx ON email_outbox (next_attempt_at) WHERE status = 'pending';
CREATE INDEX email_outbox_recipient_idx ON email_outbox (lower(to_email), created_at DESC);

-- Same pattern as sessions: only the SHA-256 of the emailed token is stored.
CREATE TABLE account_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('password_reset', 'email_verify')),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_tokens_user_idx ON account_tokens (user_id, purpose);
