-- Second Orbit: initial schema.
-- Money is stored as integer cents (USD). All ids are UUIDs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- enums
CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE verification_status AS ENUM ('unverified', 'pending', 'verified', 'failed');
CREATE TYPE item_condition AS ENUM ('mint', 'excellent', 'good', 'fair');
CREATE TYPE listing_status AS ENUM ('active', 'reserved', 'sold', 'removed');
CREATE TYPE image_kind AS ENUM ('photo', 'wear_closeup');
CREATE TYPE checkout_status AS ENUM ('open', 'paid', 'expired');
CREATE TYPE order_status AS ENUM (
  'pending_payment',  -- checkout created, awaiting Stripe
  'paid',             -- funds captured and held by the platform (escrow)
  'shipped',          -- label bought / handed to carrier
  'delivered',        -- carrier or pickup confirmed; inspection window running
  'completed',        -- buyer accepted (or window lapsed); seller paid out
  'disputed',         -- buyer opened a dispute; payout frozen
  'refunded',         -- buyer refunded
  'cancelled'         -- payment never completed
);
CREATE TYPE delivery_method AS ENUM ('ship', 'pickup');
CREATE TYPE shipment_status AS ENUM ('pre_transit', 'in_transit', 'out_for_delivery', 'delivered', 'return_to_sender', 'failure', 'unknown');
CREATE TYPE pickup_status AS ENUM ('proposed', 'accepted', 'completed', 'cancelled');
CREATE TYPE report_target AS ENUM ('listing', 'user', 'message');
CREATE TYPE report_reason AS ENUM ('counterfeit', 'misleading', 'prohibited', 'scam', 'harassment', 'spam', 'other');
CREATE TYPE report_status AS ENUM ('open', 'actioned', 'dismissed');
CREATE TYPE dispute_reason AS ENUM ('not_received', 'not_as_described', 'damaged', 'counterfeit', 'other');
CREATE TYPE dispute_status AS ENUM ('open', 'resolved_refund', 'resolved_release');

-- ---------------------------------------------------------------- users & sessions
CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text NOT NULL,
  password_hash         text NOT NULL,
  display_name          text NOT NULL,
  location              text NOT NULL DEFAULT '',
  bio                   text NOT NULL DEFAULT '',
  role                  user_role NOT NULL DEFAULT 'user',
  verification_status   verification_status NOT NULL DEFAULT 'unverified',
  identity_session_id   text,
  stripe_account_id     text,
  payouts_enabled       boolean NOT NULL DEFAULT false,
  -- Private ship-from address, only used to buy shipping labels.
  ship_from             jsonb,
  suspended_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,           -- sha256 of the cookie token; raw token never stored
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- ---------------------------------------------------------------- catalogue
CREATE TABLE categories (
  id     text PRIMARY KEY,
  name   text NOT NULL,
  blurb  text NOT NULL DEFAULT '',
  sort   int NOT NULL DEFAULT 0
);

CREATE TABLE listings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id             uuid NOT NULL REFERENCES users(id),
  category_id           text NOT NULL REFERENCES categories(id),
  title                 text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  brand                 text NOT NULL DEFAULT '',
  description           text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 4000),
  wear_notes            text NOT NULL CHECK (char_length(wear_notes) BETWEEN 3 AND 2000),
  condition             item_condition NOT NULL,
  price_cents           int NOT NULL CHECK (price_cents > 0 AND price_cents <= 10000000),
  original_price_cents  int NOT NULL CHECK (original_price_cents > 0),
  original_note         text NOT NULL DEFAULT '',
  shipping_cents        int NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  pickup_only           boolean NOT NULL DEFAULT false,
  specs                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  featured              boolean NOT NULL DEFAULT false,
  status                listing_status NOT NULL DEFAULT 'active',
  reserved_until        timestamptz,
  removed_reason        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  search                tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(brand, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '') || ' ' || coalesce(wear_notes, '')), 'C')
  ) STORED
);
CREATE INDEX listings_search_idx ON listings USING gin (search);
CREATE INDEX listings_status_created_idx ON listings (status, created_at DESC);
CREATE INDEX listings_category_idx ON listings (category_id);
CREATE INDEX listings_seller_idx ON listings (seller_id);

CREATE TABLE listing_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id    uuid REFERENCES listings(id) ON DELETE CASCADE,  -- null until the listing is published
  kind          image_kind NOT NULL DEFAULT 'photo',
  position      int NOT NULL DEFAULT 0,
  storage_key   text NOT NULL,       -- full-size webp
  thumb_key     text NOT NULL,       -- 480px webp
  width         int NOT NULL,
  height        int NOT NULL,
  alt           text NOT NULL DEFAULT '',
  quality       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_images_listing_idx ON listing_images (listing_id, position);
CREATE INDEX listing_images_owner_idx ON listing_images (owner_id) WHERE listing_id IS NULL;

CREATE TABLE saved_items (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

-- ---------------------------------------------------------------- checkout & orders
CREATE TABLE checkouts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id              uuid NOT NULL REFERENCES users(id),
  provider_session_id   text,
  payment_intent_id     text,
  charge_id             text,
  status                checkout_status NOT NULL DEFAULT 'open',
  total_cents           int NOT NULL,
  expires_at            timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- One order per seller per checkout; each order is its own escrow.
CREATE TABLE orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id           uuid NOT NULL REFERENCES checkouts(id),
  buyer_id              uuid NOT NULL REFERENCES users(id),
  seller_id             uuid NOT NULL REFERENCES users(id),
  status                order_status NOT NULL DEFAULT 'pending_payment',
  delivery_method       delivery_method NOT NULL,
  items_cents           int NOT NULL,
  shipping_cents        int NOT NULL,
  protection_fee_cents  int NOT NULL,
  platform_fee_cents    int NOT NULL,
  total_cents           int NOT NULL,
  -- Shipping address as collected by Stripe Checkout (never entered on our forms).
  ship_to               jsonb,
  transfer_id           text,
  refund_id             text,
  refunded_cents        int NOT NULL DEFAULT 0,
  paid_at               timestamptz,
  shipped_at            timestamptz,
  delivered_at          timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_buyer_idx ON orders (buyer_id, created_at DESC);
CREATE INDEX orders_seller_idx ON orders (seller_id, created_at DESC);
CREATE INDEX orders_checkout_idx ON orders (checkout_id);
CREATE INDEX orders_release_idx ON orders (delivered_at) WHERE status = 'delivered';

CREATE TABLE order_items (
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  listing_id    uuid NOT NULL REFERENCES listings(id),
  title         text NOT NULL,
  price_cents   int NOT NULL,
  shipping_cents int NOT NULL,
  PRIMARY KEY (order_id, listing_id)
);

CREATE TABLE shipments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  provider              text NOT NULL,
  provider_shipment_id  text NOT NULL,
  carrier               text NOT NULL,
  service               text NOT NULL DEFAULT '',
  tracking_code         text NOT NULL,
  label_url             text NOT NULL,
  status                shipment_status NOT NULL DEFAULT 'pre_transit',
  events                jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipments_tracking_idx ON shipments (tracking_code);

CREATE TABLE pickups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  proposed_by   uuid NOT NULL REFERENCES users(id),
  starts_at     timestamptz NOT NULL,
  location      text NOT NULL,
  note          text NOT NULL DEFAULT '',
  status        pickup_status NOT NULL DEFAULT 'proposed',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pickups_order_idx ON pickups (order_id, created_at DESC);

-- ---------------------------------------------------------------- messaging
CREATE TABLE conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid NOT NULL REFERENCES listings(id),
  buyer_id      uuid NOT NULL REFERENCES users(id),
  seller_id     uuid NOT NULL REFERENCES users(id),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);
CREATE INDEX conversations_buyer_idx ON conversations (buyer_id, last_message_at DESC);
CREATE INDEX conversations_seller_idx ON conversations (seller_id, last_message_at DESC);

CREATE TABLE messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        uuid NOT NULL REFERENCES users(id),
  body             text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);

-- ---------------------------------------------------------------- trust & safety
CREATE TABLE reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL UNIQUE REFERENCES orders(id),
  reviewer_id   uuid NOT NULL REFERENCES users(id),
  seller_id     uuid NOT NULL REFERENCES users(id),
  rating        int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_seller_idx ON reviews (seller_id, created_at DESC);

CREATE TABLE reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid NOT NULL REFERENCES users(id),
  target_type      report_target NOT NULL,
  target_id        uuid NOT NULL,
  reason           report_reason NOT NULL,
  details          text NOT NULL DEFAULT '',
  status           report_status NOT NULL DEFAULT 'open',
  resolved_by      uuid REFERENCES users(id),
  resolution_note  text,
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_open_idx ON reports (created_at) WHERE status = 'open';
CREATE UNIQUE INDEX reports_one_open_per_reporter ON reports (reporter_id, target_type, target_id) WHERE status = 'open';

CREATE TABLE disputes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL UNIQUE REFERENCES orders(id),
  opened_by        uuid NOT NULL REFERENCES users(id),
  reason           dispute_reason NOT NULL,
  details          text NOT NULL,
  seller_response  text,
  status           dispute_status NOT NULL DEFAULT 'open',
  resolution_note  text,
  refund_cents     int,
  resolved_by      uuid REFERENCES users(id),
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE moderation_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid NOT NULL REFERENCES users(id),
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    uuid NOT NULL,
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- infrastructure
-- Webhook idempotency: each provider event is processed once.
CREATE TABLE webhook_events (
  provider     text NOT NULL,
  event_id     text NOT NULL,
  type         text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- Used only by the mock analytics adapter. Holds no user ids, IPs or cookies.
CREATE TABLE analytics_events (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  path        text NOT NULL DEFAULT '',
  props       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
