ALTER TABLE app_users
  ADD COLUMN receives_competition_alerts boolean NOT NULL DEFAULT false;

CREATE TABLE competition_alert_deliveries (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, competition_id),
  CONSTRAINT competition_alert_delivery_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed'))
);

CREATE INDEX competition_alert_deliveries_retry_idx
  ON competition_alert_deliveries (status, last_attempt_at);
