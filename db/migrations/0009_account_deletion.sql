-- Account deletion. Accounts are anonymised, not removed: orders, reviews and the audit log point
-- at users(id), and financial records must outlive the account. Additive only.
--
-- Down (manual; the runner is forward-only):
--   ALTER TABLE users DROP COLUMN deleted_at;

ALTER TABLE users ADD COLUMN deleted_at timestamptz;
