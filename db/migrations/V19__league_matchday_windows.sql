CREATE TABLE league_matchdays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  competition_category_id uuid NOT NULL REFERENCES competition_categories(id) ON DELETE CASCADE,
  round_number integer NOT NULL CHECK (round_number > 0),
  starts_at date NOT NULL,
  ends_at date NOT NULL,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_category_id, round_number),
  CHECK (ends_at >= starts_at)
);

ALTER TABLE matches
  ADD COLUMN league_matchday_id uuid REFERENCES league_matchdays(id) ON DELETE SET NULL;

ALTER TABLE team_ties
  ADD COLUMN league_matchday_id uuid REFERENCES league_matchdays(id) ON DELETE SET NULL;

INSERT INTO league_matchdays (season_id, competition_id, competition_category_id, round_number, starts_at, ends_at)
SELECT
  m.season_id,
  m.competition_id,
  m.competition_category_id,
  m.round_number,
  MIN(COALESCE(m.scheduled_at::date, c.starts_at::date)),
  GREATEST(MAX(COALESCE(m.scheduled_at::date, c.starts_at::date)), MIN(COALESCE(m.scheduled_at::date, c.starts_at::date)) + 13)
FROM matches m
JOIN competitions c ON c.id = m.competition_id
WHERE c.type IN ('individual_league', 'team_league')
  AND m.round_number IS NOT NULL
GROUP BY m.season_id, m.competition_id, m.competition_category_id, m.round_number
ON CONFLICT (competition_category_id, round_number) DO NOTHING;

UPDATE matches m
SET league_matchday_id = lm.id
FROM league_matchdays lm
WHERE lm.competition_category_id = m.competition_category_id
  AND lm.round_number = m.round_number;

UPDATE team_ties tt
SET league_matchday_id = m.league_matchday_id
FROM matches m
WHERE m.team_tie_id = tt.id
  AND m.league_matchday_id IS NOT NULL;

CREATE INDEX idx_league_matchdays_competition ON league_matchdays (competition_id, competition_category_id, round_number);
CREATE INDEX idx_matches_league_matchday ON matches (league_matchday_id);
CREATE INDEX idx_team_ties_league_matchday ON team_ties (league_matchday_id);

CREATE TRIGGER set_league_matchdays_updated_at BEFORE UPDATE ON league_matchdays
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
