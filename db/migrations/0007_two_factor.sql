-- TOTP two-factor sign-in. Additive only.
--
-- Down (manual; the runner is forward-only):
--   DROP TABLE auth_challenges; DROP TABLE recovery_codes;
--   ALTER TABLE users DROP COLUMN totp_secret, DROP COLUMN totp_enabled_at, DROP COLUMN totp_last_step;

ALTER TABLE users
  ADD COLUMN totp_secret     text,                       -- AES-256-GCM sealed; set while enrolling
  ADD COLUMN totp_enabled_at timestamptz,                -- null until a first code proves the setup
  ADD COLUMN totp_last_step  bigint NOT NULL DEFAULT 0;  -- newest accepted time step, blocks replays

CREATE TABLE recovery_codes (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  used_at    timestamptz,
  PRIMARY KEY (user_id, code_hash)
);

-- A password (or social) step that passed and now awaits a code. Not a session: it grants nothing else.
CREATE TABLE auth_challenges (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
