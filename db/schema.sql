-- AVM lead and revenue dashboard schema (Postgres / Neon).
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS campaigns (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  prefilled_message  TEXT NOT NULL DEFAULT '',
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id             SERIAL PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_name  TEXT NOT NULL,
  business_name  TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL,
  service        TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'Ad' CHECK (source IN ('Ad', 'Other')),
  campaign_id    INTEGER REFERENCES campaigns(id),
  status         TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Quoted', 'Won', 'Lost')),
  amount         NUMERIC(12, 2),
  lost_reason    TEXT,
  handled_by     TEXT NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  duplicate      BOOLEAN NOT NULL DEFAULT FALSE,
  quoted_at      TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads (phone);

CREATE TABLE IF NOT EXISTS ad_stats (
  id             SERIAL PRIMARY KEY,
  campaign_id    INTEGER NOT NULL REFERENCES campaigns(id),
  week_start     DATE NOT NULL,
  spend          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  impressions    INTEGER NOT NULL DEFAULT 0,
  clicks         INTEGER NOT NULL DEFAULT 0,
  conversations  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, week_start)
);

CREATE TABLE IF NOT EXISTS summaries (
  id          SERIAL PRIMARY KEY,
  week_start  DATE NOT NULL UNIQUE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL
);

-- Wrong-PIN tracking for the lockout (5 tries, then 15 minutes).
CREATE TABLE IF NOT EXISTS login_attempts (
  client_key    TEXT PRIMARY KEY,
  failures      INTEGER NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ
);

INSERT INTO settings (key, value) VALUES
  ('services', '["Visiting cards", "Flex banners", "Brochures", "Letterheads", "Stickers and labels", "Other"]'),
  ('staff', '[]'),
  ('thresholds', '{"logging_min": 0.70, "junk_max": 0.30, "followup_max": 0.25, "followup_days": 2, "win_rate_min": 0.20, "cpl_rise_max": 0.30, "min_leads": 5}')
ON CONFLICT (key) DO NOTHING;
