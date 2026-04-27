CREATE TABLE auth_credentials (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE club_season_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  logo_url text,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, season_id)
);

ALTER TABLE players
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE clubs
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE seasons
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE categories
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE player_club_memberships
  ADD COLUMN club_name_at_that_time text,
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE player_club_memberships pcm
SET club_name_at_that_time = c.name
FROM clubs c
WHERE c.id = pcm.club_id;

ALTER TABLE player_club_memberships
  ALTER COLUMN club_name_at_that_time SET NOT NULL;

ALTER TABLE competitions
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE competition_categories
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE teams
  ADD COLUMN club_name_at_creation text,
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

UPDATE teams t
SET club_name_at_creation = c.name
FROM clubs c
WHERE c.id = t.club_id;

ALTER TABLE teams
  ALTER COLUMN club_name_at_creation SET NOT NULL;

ALTER TABLE team_rosters
  ADD COLUMN team_name_at_that_time text,
  ADD COLUMN club_name_at_that_time text,
  ADD COLUMN player_name_at_that_time text,
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE team_rosters tr
SET
  team_name_at_that_time = (SELECT name FROM teams WHERE id = tr.team_id),
  club_name_at_that_time = (
    SELECT c.name FROM teams t JOIN clubs c ON c.id = t.club_id WHERE t.id = tr.team_id
  ),
  player_name_at_that_time = (
    SELECT concat_ws(' ', first_name, last_name) FROM players WHERE id = tr.player_id
  );

ALTER TABLE team_rosters
  ALTER COLUMN team_name_at_that_time SET NOT NULL,
  ALTER COLUMN club_name_at_that_time SET NOT NULL,
  ALTER COLUMN player_name_at_that_time SET NOT NULL;

ALTER TABLE club_join_requests
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE team_ties
  ADD COLUMN home_team_name_at_time text,
  ADD COLUMN away_team_name_at_time text,
  ADD COLUMN home_club_name_at_time text,
  ADD COLUMN away_club_name_at_time text,
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

UPDATE team_ties tt
SET
  home_team_name_at_time = (SELECT name FROM teams WHERE id = tt.home_team_id),
  away_team_name_at_time = (SELECT name FROM teams WHERE id = tt.away_team_id),
  home_club_name_at_time = (
    SELECT c.name FROM teams t JOIN clubs c ON c.id = t.club_id WHERE t.id = tt.home_team_id
  ),
  away_club_name_at_time = (
    SELECT c.name FROM teams t JOIN clubs c ON c.id = t.club_id WHERE t.id = tt.away_team_id
  );

ALTER TABLE matches
  ADD COLUMN home_player_name_at_match_time text,
  ADD COLUMN away_player_name_at_match_time text,
  ADD COLUMN home_club_name_at_match_time text,
  ADD COLUMN away_club_name_at_match_time text,
  ADD COLUMN home_team_name_at_match_time text,
  ADD COLUMN away_team_name_at_match_time text,
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

UPDATE matches m
SET
  home_player_name_at_match_time = (
    SELECT concat_ws(' ', first_name, last_name) FROM players WHERE id = m.home_player_id
  ),
  away_player_name_at_match_time = (
    SELECT concat_ws(' ', first_name, last_name) FROM players WHERE id = m.away_player_id
  ),
  home_club_name_at_match_time = (
    SELECT name FROM clubs WHERE id = m.home_club_id_at_match_time
  ),
  away_club_name_at_match_time = (
    SELECT name FROM clubs WHERE id = m.away_club_id_at_match_time
  ),
  home_team_name_at_match_time = (
    SELECT name FROM teams WHERE id = m.home_team_id_at_match_time
  ),
  away_team_name_at_match_time = (
    SELECT name FROM teams WHERE id = m.away_team_id_at_match_time
  );

ALTER TABLE tournament_registrations
  ADD COLUMN player_name_at_registration text,
  ADD COLUMN club_name_at_registration text,
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

UPDATE tournament_registrations tr
SET
  player_name_at_registration = (
    SELECT concat_ws(' ', first_name, last_name) FROM players WHERE id = tr.player_id
  ),
  club_name_at_registration = (
    SELECT name FROM clubs WHERE id = tr.club_id_at_registration
  );

ALTER TABLE tournament_registrations
  ALTER COLUMN player_name_at_registration SET NOT NULL;

ALTER TABLE tournament_seeds
  ADD COLUMN player_name_at_time text,
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE tournament_seeds ts
SET player_name_at_time = concat_ws(' ', p.first_name, p.last_name)
FROM players p
WHERE p.id = ts.player_id;

ALTER TABLE tournament_seeds
  ALTER COLUMN player_name_at_time SET NOT NULL;

ALTER TABLE tournament_draw_entries
  ADD COLUMN player_name_at_time text,
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE tournament_draw_entries tde
SET player_name_at_time = concat_ws(' ', p.first_name, p.last_name)
FROM players p
WHERE p.id = tde.player_id;

ALTER TABLE individual_ranking_snapshots
  ADD COLUMN player_name_at_that_time text,
  ADD COLUMN club_name_at_that_time text,
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

UPDATE individual_ranking_snapshots irs
SET
  player_name_at_that_time = (
    SELECT concat_ws(' ', first_name, last_name) FROM players WHERE id = irs.player_id
  ),
  club_name_at_that_time = (
    SELECT name FROM clubs WHERE id = irs.club_id_at_that_time
  );

ALTER TABLE individual_ranking_snapshots
  ALTER COLUMN player_name_at_that_time SET NOT NULL;

ALTER TABLE team_ranking_snapshots
  ADD COLUMN team_name_at_that_time text,
  ADD COLUMN club_name_at_that_time text,
  ADD COLUMN created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

UPDATE team_ranking_snapshots trs
SET
  team_name_at_that_time = t.name,
  club_name_at_that_time = c.name
FROM teams t
JOIN clubs c ON c.id = t.club_id
WHERE t.id = trs.team_id;

ALTER TABLE team_ranking_snapshots
  ALTER COLUMN team_name_at_that_time SET NOT NULL,
  ALTER COLUMN club_name_at_that_time SET NOT NULL;

CREATE INDEX idx_auth_sessions_token_hash ON auth_sessions (token_hash);
CREATE INDEX idx_auth_sessions_user_expires ON auth_sessions (user_id, expires_at);
CREATE INDEX idx_club_season_profiles_lookup ON club_season_profiles (club_id, season_id);

CREATE TRIGGER set_auth_credentials_updated_at BEFORE UPDATE ON auth_credentials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_club_season_profiles_updated_at BEFORE UPDATE ON club_season_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_categories_updated_at BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_player_club_memberships_updated_at BEFORE UPDATE ON player_club_memberships
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_competition_categories_updated_at BEFORE UPDATE ON competition_categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_team_rosters_updated_at BEFORE UPDATE ON team_rosters
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_club_join_requests_updated_at BEFORE UPDATE ON club_join_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_tournament_seeds_updated_at BEFORE UPDATE ON tournament_seeds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_tournament_draw_entries_updated_at BEFORE UPDATE ON tournament_draw_entries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
