ALTER TABLE app_users
  ADD COLUMN email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN phone text,
  ADD COLUMN preferred_locale text NOT NULL DEFAULT 'es'
    CHECK (preferred_locale IN ('ca', 'es', 'en'));

ALTER TABLE competitions
  ADD COLUMN description text;

CREATE TABLE competition_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  competition_category_id uuid NOT NULL REFERENCES competition_categories(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  seed_number integer CHECK (seed_number IS NULL OR seed_number > 0),
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (player_id IS NOT NULL AND club_id IS NULL)
    OR
    (player_id IS NULL AND club_id IS NOT NULL)
  ),
  UNIQUE (competition_category_id, player_id),
  UNIQUE (competition_category_id, club_id),
  UNIQUE (competition_category_id, seed_number)
);

CREATE INDEX idx_competition_participants_competition
  ON competition_participants (competition_id, competition_category_id);

CREATE INDEX idx_app_users_locale ON app_users (preferred_locale);
