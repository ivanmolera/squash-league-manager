CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'player');
CREATE TYPE season_status AS ENUM ('draft', 'active', 'closed');
CREATE TYPE gender AS ENUM ('male', 'female', 'other', 'not_specified');
CREATE TYPE dominant_hand AS ENUM ('right', 'left', 'ambidextrous', 'not_specified');
CREATE TYPE competition_type AS ENUM ('individual_league', 'team_league', 'tournament');
CREATE TYPE competition_status AS ENUM ('draft', 'registration_open', 'active', 'closed', 'cancelled');
CREATE TYPE competition_format AS ENUM ('league', 'knockout', 'round_robin');
CREATE TYPE match_type AS ENUM ('individual_league', 'team_rubber', 'tournament_knockout', 'tournament_round_robin');
CREATE TYPE match_status AS ENUM ('scheduled', 'played', 'walkover', 'bye', 'cancelled', 'retired');
CREATE TYPE registration_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE join_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE,
  email citext NOT NULL UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user_roles (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES app_users(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  gender gender NOT NULL DEFAULT 'not_specified',
  birth_date date,
  height_cm integer CHECK (height_cm IS NULL OR height_cm BETWEEN 90 AND 240),
  weight_kg numeric(5,2) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 250),
  dominant_hand dominant_hand NOT NULL DEFAULT 'not_specified',
  racket_brand text,
  profile_photo_url text,
  generic_profile_variant text NOT NULL DEFAULT 'neutral'
    CHECK (generic_profile_variant IN ('male', 'female', 'neutral')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  city text,
  address text,
  website_url text,
  logo_url text,
  manager_user_id uuid UNIQUE REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  starts_at date NOT NULL,
  ends_at date NOT NULL,
  status season_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gender_scope gender NOT NULL DEFAULT 'not_specified',
  min_age integer CHECK (min_age IS NULL OR min_age >= 0),
  max_age integer CHECK (max_age IS NULL OR max_age >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, gender_scope, min_age, max_age),
  CHECK (max_age IS NULL OR min_age IS NULL OR max_age >= min_age)
);

CREATE TABLE player_club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, club_id, season_id),
  CHECK (to_date IS NULL OR to_date >= from_date)
);

CREATE TABLE competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  type competition_type NOT NULL,
  status competition_status NOT NULL DEFAULT 'draft',
  name text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  host_club_id uuid REFERENCES clubs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, type, name),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE competition_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  format competition_format NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, category_id)
);

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, season_id, category_id, name)
);

CREATE TABLE team_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  from_date date NOT NULL,
  to_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, player_id, season_id, category_id),
  CHECK (to_date IS NULL OR to_date >= from_date)
);

CREATE TABLE club_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  status join_request_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  notes text,
  UNIQUE (player_id, club_id, season_id)
);

CREATE TABLE team_ties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  competition_category_id uuid NOT NULL REFERENCES competition_categories(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  home_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  away_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  scheduled_at timestamptz,
  played_at timestamptz,
  venue_club_id uuid REFERENCES clubs(id) ON DELETE SET NULL,
  status match_status NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_team_id <> away_team_id)
);

CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  competition_category_id uuid NOT NULL REFERENCES competition_categories(id) ON DELETE CASCADE,
  team_tie_id uuid REFERENCES team_ties(id) ON DELETE CASCADE,
  match_type match_type NOT NULL,
  status match_status NOT NULL DEFAULT 'scheduled',
  match_order integer CHECK (match_order IS NULL OR match_order > 0),
  round_number integer CHECK (round_number IS NULL OR round_number > 0),
  bracket_position integer CHECK (bracket_position IS NULL OR bracket_position > 0),
  scheduled_at timestamptz,
  played_at timestamptz,
  venue_club_id uuid REFERENCES clubs(id) ON DELETE SET NULL,
  court text,
  home_player_id uuid REFERENCES players(id) ON DELETE RESTRICT,
  away_player_id uuid REFERENCES players(id) ON DELETE RESTRICT,
  winner_player_id uuid REFERENCES players(id) ON DELETE RESTRICT,
  walkover_by_player_id uuid REFERENCES players(id) ON DELETE RESTRICT,
  retired_by_player_id uuid REFERENCES players(id) ON DELETE RESTRICT,
  home_club_id_at_match_time uuid REFERENCES clubs(id) ON DELETE SET NULL,
  away_club_id_at_match_time uuid REFERENCES clubs(id) ON DELETE SET NULL,
  home_team_id_at_match_time uuid REFERENCES teams(id) ON DELETE SET NULL,
  away_team_id_at_match_time uuid REFERENCES teams(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_player_id IS NULL OR away_player_id IS NULL OR home_player_id <> away_player_id),
  CHECK (winner_player_id IS NULL OR winner_player_id IN (home_player_id, away_player_id)),
  CHECK (walkover_by_player_id IS NULL OR walkover_by_player_id IN (home_player_id, away_player_id)),
  CHECK (retired_by_player_id IS NULL OR retired_by_player_id IN (home_player_id, away_player_id)),
  CHECK (
    status <> 'bye'
    OR (winner_player_id IS NOT NULL AND (home_player_id IS NULL OR away_player_id IS NULL))
  ),
  CHECK (
    status <> 'walkover'
    OR (winner_player_id IS NOT NULL AND walkover_by_player_id IS NOT NULL AND winner_player_id <> walkover_by_player_id)
  )
);

CREATE TABLE match_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  set_number integer NOT NULL CHECK (set_number BETWEEN 1 AND 5),
  home_points integer NOT NULL CHECK (home_points >= 0),
  away_points integer NOT NULL CHECK (away_points >= 0),
  UNIQUE (match_id, set_number),
  CHECK (
    (home_points > away_points AND home_points >= 11 AND home_points - away_points >= 2)
    OR
    (away_points > home_points AND away_points >= 11 AND away_points - home_points >= 2)
  )
);

CREATE TABLE tournament_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_category_id uuid NOT NULL REFERENCES competition_categories(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id_at_registration uuid REFERENCES clubs(id) ON DELETE SET NULL,
  status registration_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_category_id, player_id)
);

CREATE TABLE tournament_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_category_id uuid NOT NULL REFERENCES competition_categories(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seed_number integer NOT NULL CHECK (seed_number > 0),
  suggested boolean NOT NULL DEFAULT true,
  locked_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_category_id, player_id),
  UNIQUE (competition_category_id, seed_number)
);

CREATE TABLE tournament_draw_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_category_id uuid NOT NULL REFERENCES competition_categories(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  seed_number integer CHECK (seed_number IS NULL OR seed_number > 0),
  bracket_position integer NOT NULL CHECK (bracket_position > 0),
  is_bye boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_category_id, bracket_position),
  CHECK ((is_bye AND player_id IS NULL) OR (NOT is_bye AND player_id IS NOT NULL))
);

CREATE TABLE individual_ranking_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  competition_category_id uuid NOT NULL REFERENCES competition_categories(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  club_id_at_that_time uuid REFERENCES clubs(id) ON DELETE SET NULL,
  position integer NOT NULL CHECK (position > 0),
  matches_won integer NOT NULL DEFAULT 0,
  matches_lost integer NOT NULL DEFAULT 0,
  walkovers_won integer NOT NULL DEFAULT 0,
  walkovers_lost integer NOT NULL DEFAULT 0,
  sets_for integer NOT NULL DEFAULT 0,
  sets_against integer NOT NULL DEFAULT 0,
  points_for integer NOT NULL DEFAULT 0,
  points_against integer NOT NULL DEFAULT 0,
  win_percentage numeric(6,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, competition_id, competition_category_id, player_id)
);

CREATE TABLE team_ranking_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  competition_category_id uuid NOT NULL REFERENCES competition_categories(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position > 0),
  ties_won integer NOT NULL DEFAULT 0,
  ties_drawn integer NOT NULL DEFAULT 0,
  ties_lost integer NOT NULL DEFAULT 0,
  rubbers_for integer NOT NULL DEFAULT 0,
  rubbers_against integer NOT NULL DEFAULT 0,
  points_for integer NOT NULL DEFAULT 0,
  points_against integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, competition_id, competition_category_id, team_id)
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_name ON players (last_name, first_name);
CREATE INDEX idx_memberships_player_season ON player_club_memberships (player_id, season_id);
CREATE INDEX idx_memberships_club_season ON player_club_memberships (club_id, season_id);
CREATE INDEX idx_teams_club_season ON teams (club_id, season_id);
CREATE INDEX idx_team_rosters_player_season ON team_rosters (player_id, season_id);
CREATE INDEX idx_competitions_season_type ON competitions (season_id, type);
CREATE INDEX idx_team_ties_competition ON team_ties (competition_id, competition_category_id);
CREATE INDEX idx_matches_competition_category ON matches (competition_id, competition_category_id);
CREATE INDEX idx_matches_players ON matches (home_player_id, away_player_id);
CREATE INDEX idx_matches_scheduled_at ON matches (scheduled_at);
CREATE INDEX idx_match_sets_match ON match_sets (match_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_app_users_updated_at BEFORE UPDATE ON app_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_players_updated_at BEFORE UPDATE ON players
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_clubs_updated_at BEFORE UPDATE ON clubs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_seasons_updated_at BEFORE UPDATE ON seasons
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_competitions_updated_at BEFORE UPDATE ON competitions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_teams_updated_at BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_team_ties_updated_at BEFORE UPDATE ON team_ties
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_matches_updated_at BEFORE UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_tournament_registrations_updated_at BEFORE UPDATE ON tournament_registrations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE VIEW match_score_totals AS
SELECT
  m.id AS match_id,
  COALESCE(SUM(CASE WHEN ms.home_points > ms.away_points THEN 1 ELSE 0 END), 0)::integer AS home_sets_won,
  COALESCE(SUM(CASE WHEN ms.away_points > ms.home_points THEN 1 ELSE 0 END), 0)::integer AS away_sets_won,
  COALESCE(SUM(ms.home_points), 0)::integer AS home_points,
  COALESCE(SUM(ms.away_points), 0)::integer AS away_points
FROM matches m
LEFT JOIN match_sets ms ON ms.match_id = m.id
GROUP BY m.id;

CREATE VIEW current_individual_rankings AS
WITH player_rows AS (
  SELECT
    m.season_id,
    m.competition_id,
    m.competition_category_id,
    m.home_player_id AS player_id,
    m.home_club_id_at_match_time AS club_id,
    CASE WHEN m.winner_player_id = m.home_player_id THEN 1 ELSE 0 END AS won,
    CASE WHEN m.winner_player_id = m.away_player_id THEN 1 ELSE 0 END AS lost,
    CASE WHEN m.status = 'walkover' AND m.winner_player_id = m.home_player_id THEN 1 ELSE 0 END AS walkovers_won,
    CASE WHEN m.status = 'walkover' AND m.walkover_by_player_id = m.home_player_id THEN 1 ELSE 0 END AS walkovers_lost,
    mst.home_sets_won AS sets_for,
    mst.away_sets_won AS sets_against,
    mst.home_points AS points_for,
    mst.away_points AS points_against
  FROM matches m
  JOIN match_score_totals mst ON mst.match_id = m.id
  WHERE m.home_player_id IS NOT NULL
    AND m.status IN ('played', 'walkover', 'retired')
    AND m.match_type IN ('individual_league', 'tournament_round_robin')
  UNION ALL
  SELECT
    m.season_id,
    m.competition_id,
    m.competition_category_id,
    m.away_player_id AS player_id,
    m.away_club_id_at_match_time AS club_id,
    CASE WHEN m.winner_player_id = m.away_player_id THEN 1 ELSE 0 END AS won,
    CASE WHEN m.winner_player_id = m.home_player_id THEN 1 ELSE 0 END AS lost,
    CASE WHEN m.status = 'walkover' AND m.winner_player_id = m.away_player_id THEN 1 ELSE 0 END AS walkovers_won,
    CASE WHEN m.status = 'walkover' AND m.walkover_by_player_id = m.away_player_id THEN 1 ELSE 0 END AS walkovers_lost,
    mst.away_sets_won AS sets_for,
    mst.home_sets_won AS sets_against,
    mst.away_points AS points_for,
    mst.home_points AS points_against
  FROM matches m
  JOIN match_score_totals mst ON mst.match_id = m.id
  WHERE m.away_player_id IS NOT NULL
    AND m.status IN ('played', 'walkover', 'retired')
    AND m.match_type IN ('individual_league', 'tournament_round_robin')
),
aggregated AS (
  SELECT
    season_id,
    competition_id,
    competition_category_id,
    player_id,
    min(club_id::text)::uuid AS club_id,
    sum(won)::integer AS matches_won,
    sum(lost)::integer AS matches_lost,
    sum(walkovers_won)::integer AS walkovers_won,
    sum(walkovers_lost)::integer AS walkovers_lost,
    sum(sets_for)::integer AS sets_for,
    sum(sets_against)::integer AS sets_against,
    sum(points_for)::integer AS points_for,
    sum(points_against)::integer AS points_against
  FROM player_rows
  GROUP BY season_id, competition_id, competition_category_id, player_id
)
SELECT
  *,
  CASE
    WHEN matches_won + matches_lost = 0 THEN 0::numeric
    ELSE round(matches_won::numeric / (matches_won + matches_lost), 3)
  END AS win_percentage,
  rank() OVER (
    PARTITION BY season_id, competition_id, competition_category_id
    ORDER BY matches_won DESC,
             CASE WHEN matches_won + matches_lost = 0 THEN 0 ELSE matches_won::numeric / (matches_won + matches_lost) END DESC,
             (sets_for - sets_against) DESC,
             (points_for - points_against) DESC,
             points_for DESC
  )::integer AS position
FROM aggregated;

CREATE VIEW current_team_rankings AS
WITH rubber_rows AS (
  SELECT
    tt.season_id,
    tt.competition_id,
    tt.competition_category_id,
    tt.id AS team_tie_id,
    tt.home_team_id AS team_id,
    t.club_id,
    CASE WHEN m.winner_player_id = m.home_player_id THEN 1 ELSE 0 END AS rubbers_for,
    CASE WHEN m.winner_player_id = m.away_player_id THEN 1 ELSE 0 END AS rubbers_against,
    mst.home_points AS points_for,
    mst.away_points AS points_against
  FROM team_ties tt
  JOIN teams t ON t.id = tt.home_team_id
  JOIN matches m ON m.team_tie_id = tt.id
  JOIN match_score_totals mst ON mst.match_id = m.id
  WHERE m.status IN ('played', 'walkover', 'retired')
  UNION ALL
  SELECT
    tt.season_id,
    tt.competition_id,
    tt.competition_category_id,
    tt.id AS team_tie_id,
    tt.away_team_id AS team_id,
    t.club_id,
    CASE WHEN m.winner_player_id = m.away_player_id THEN 1 ELSE 0 END AS rubbers_for,
    CASE WHEN m.winner_player_id = m.home_player_id THEN 1 ELSE 0 END AS rubbers_against,
    mst.away_points AS points_for,
    mst.home_points AS points_against
  FROM team_ties tt
  JOIN teams t ON t.id = tt.away_team_id
  JOIN matches m ON m.team_tie_id = tt.id
  JOIN match_score_totals mst ON mst.match_id = m.id
  WHERE m.status IN ('played', 'walkover', 'retired')
),
tie_rows AS (
  SELECT
    season_id,
    competition_id,
    competition_category_id,
    team_tie_id,
    team_id,
    club_id,
    sum(rubbers_for)::integer AS rubbers_for,
    sum(rubbers_against)::integer AS rubbers_against,
    sum(points_for)::integer AS points_for,
    sum(points_against)::integer AS points_against
  FROM rubber_rows
  GROUP BY season_id, competition_id, competition_category_id, team_tie_id, team_id, club_id
),
aggregated AS (
  SELECT
    season_id,
    competition_id,
    competition_category_id,
    team_id,
    club_id,
    sum(CASE WHEN rubbers_for > rubbers_against THEN 1 ELSE 0 END)::integer AS ties_won,
    sum(CASE WHEN rubbers_for = rubbers_against THEN 1 ELSE 0 END)::integer AS ties_drawn,
    sum(CASE WHEN rubbers_for < rubbers_against THEN 1 ELSE 0 END)::integer AS ties_lost,
    sum(rubbers_for)::integer AS rubbers_for,
    sum(rubbers_against)::integer AS rubbers_against,
    sum(points_for)::integer AS points_for,
    sum(points_against)::integer AS points_against
  FROM tie_rows
  GROUP BY season_id, competition_id, competition_category_id, team_id, club_id
)
SELECT
  *,
  rank() OVER (
    PARTITION BY season_id, competition_id, competition_category_id
    ORDER BY rubbers_for DESC,
             (points_for - points_against) DESC,
             points_for DESC
  )::integer AS position
FROM aggregated;
