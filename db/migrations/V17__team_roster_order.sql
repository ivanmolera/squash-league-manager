ALTER TABLE team_rosters
  ADD COLUMN roster_order integer NOT NULL DEFAULT 0;

WITH ordered_rosters AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY team_id, season_id, category_id
      ORDER BY player_name_at_that_time, id
    ) AS roster_order
  FROM team_rosters
)
UPDATE team_rosters tr
SET roster_order = ordered_rosters.roster_order
FROM ordered_rosters
WHERE tr.id = ordered_rosters.id;

CREATE INDEX idx_team_rosters_team_order
  ON team_rosters (team_id, season_id, category_id, roster_order);
