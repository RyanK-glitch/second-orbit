-- Card chargebacks. Additive only.
-- A chargeback covers a whole card payment, which can span several orders (one per seller), so it
-- hangs off the checkout. payout_frozen_at is separate from the order status on purpose: a frozen
-- order keeps its place in the escrow flow and simply can't release or refund until the bank decides.
--
-- Down (manual; the runner is forward-only):
--   DROP TABLE chargebacks; DROP INDEX checkouts_charge_idx, checkouts_payment_intent_idx;
--   ALTER TABLE orders DROP COLUMN payout_frozen_at;

ALTER TABLE orders ADD COLUMN payout_frozen_at timestamptz;

CREATE INDEX checkouts_charge_idx ON checkouts (charge_id) WHERE charge_id IS NOT NULL;
CREATE INDEX checkouts_payment_intent_idx ON checkouts (payment_intent_id) WHERE payment_intent_id IS NOT NULL;

CREATE TABLE chargebacks (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_dispute_id    text NOT NULL UNIQUE,
  checkout_id            uuid REFERENCES checkouts(id),   -- null if the charge isn't one of ours
  charge_id              text,
  amount_cents           int NOT NULL,
  reason                 text NOT NULL DEFAULT '',
  provider_status        text NOT NULL,
  status                 text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  evidence_due_by        timestamptz,
  evidence_submitted_at  timestamptz,
  evidence_submitted_by  uuid REFERENCES users(id),
  -- The seller had already been paid and pulling it back failed, so the platform carries the loss.
  recovery_failed        boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  closed_at              timestamptz
);
CREATE INDEX chargebacks_open_idx ON chargebacks (created_at) WHERE status = 'open';
