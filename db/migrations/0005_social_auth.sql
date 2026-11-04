-- Social sign-in (Google, Apple, Facebook). Additive only.
-- Social-only accounts keep users.password_hash NOT NULL with a non-scrypt sentinel
-- ('!oauth'), which verifyPassword() always rejects.
--
-- Down (manual; the runner is forward-only):
--   DROP TABLE oauth_states; DROP TABLE oauth_accounts;
--   ALTER TABLE users DROP COLUMN email_verified_at;

-- Set when a provider vouches for the address (or a future email-verification flow does).
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE oauth_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN ('google', 'apple', 'facebook')),
  provider_user_id  text NOT NULL,               -- stable subject id ("sub" / Facebook app-scoped id)
  email             text,                        -- as last reported by the provider (may be an Apple relay address)
  email_verified    boolean NOT NULL DEFAULT false,
  is_private_email  boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz,
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);

-- One row per sign-in attempt; single use, short-lived. The browser holds the raw
-- state in a cookie and only its SHA-256 is stored, binding the callback to that browser.
CREATE TABLE oauth_states (
  state_hash     text PRIMARY KEY,
  provider       text NOT NULL,
  intent         text NOT NULL CHECK (intent IN ('signin', 'link')),
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE,   -- the account being linked (intent = link)
  code_verifier  text NOT NULL,
  nonce          text NOT NULL,
  next_path      text NOT NULL DEFAULT '/',
  apple_user     jsonb,                                          -- Apple sends the name only on first consent
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_states_expiry_idx ON oauth_states (expires_at);
