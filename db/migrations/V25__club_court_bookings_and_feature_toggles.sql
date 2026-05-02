CREATE TYPE court_reservation_status AS ENUM ('active', 'cancelled');

ALTER TABLE clubs
  ADD COLUMN phone text,
  ADD COLUMN manages_court_bookings boolean NOT NULL DEFAULT false;

CREATE TABLE app_feature_settings (
  feature_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_feature_settings (feature_key, enabled)
VALUES
  ('leagues', true),
  ('tournaments', true),
  ('court_bookings', true),
  ('rankings_statistics', true),
  ('public_registration', true),
  ('tournament_online_registration', true),
  ('player_result_entry', true),
  ('club_maps', true),
  ('player_communications', false),
  ('teams', true)
ON CONFLICT (feature_key) DO NOTHING;

CREATE TABLE court_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  court_number integer NOT NULL CHECK (court_number > 0),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  partner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status court_reservation_status NOT NULL DEFAULT 'active',
  cancelled_at timestamptz,
  cancelled_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  CHECK (ends_at > starts_at),
  CHECK (ends_at <= starts_at + interval '1 hour')
);

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE court_reservations
  ADD CONSTRAINT court_reservations_no_active_overlap
  EXCLUDE USING gist (
    club_id WITH =,
    court_number WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status = 'active');

CREATE INDEX idx_court_reservations_club_start
  ON court_reservations (club_id, starts_at);

CREATE INDEX idx_court_reservations_user_active
  ON court_reservations (user_id, starts_at)
  WHERE status = 'active';

CREATE TABLE club_closed_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  closed_on date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  UNIQUE (club_id, closed_on)
);

CREATE INDEX idx_club_closed_days_club_date
  ON club_closed_days (club_id, closed_on);

CREATE TRIGGER set_app_feature_settings_updated_at BEFORE UPDATE ON app_feature_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_court_reservations_updated_at BEFORE UPDATE ON court_reservations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_club_closed_days_updated_at BEFORE UPDATE ON club_closed_days
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
