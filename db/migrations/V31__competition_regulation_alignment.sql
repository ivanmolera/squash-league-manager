CREATE TEMP TABLE regulation_categories (
  name text NOT NULL,
  gender_scope gender NOT NULL,
  min_age integer,
  max_age integer,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO regulation_categories (name, gender_scope, min_age, max_age, sort_order) VALUES
  ('Open', 'not_specified', NULL, NULL, 1),
  ('Primera', 'not_specified', NULL, NULL, 2),
  ('Segunda', 'not_specified', NULL, NULL, 3),
  ('Tercera', 'not_specified', NULL, NULL, 4),
  ('Femenina', 'female', NULL, NULL, 5),
  ('Masc +35', 'male', 35, NULL, 6),
  ('Masc +40', 'male', 40, NULL, 7),
  ('Masc +45', 'male', 45, NULL, 8),
  ('Masc +50', 'male', 50, NULL, 9),
  ('Masc +55', 'male', 55, NULL, 10),
  ('Masc +60', 'male', 60, NULL, 11),
  ('Fem +30', 'female', 30, NULL, 12),
  ('Fem +35', 'female', 35, NULL, 13),
  ('Fem +40', 'female', 40, NULL, 14),
  ('Fem +45', 'female', 45, NULL, 15),
  ('Fem +50', 'female', 50, NULL, 16),
  ('Fem +55', 'female', 55, NULL, 17),
  ('Fem +60', 'female', 60, NULL, 18),
  ('Masc Sub-9', 'male', NULL, 8, 19),
  ('Masc Sub-11', 'male', NULL, 10, 20),
  ('Masc Sub-13', 'male', NULL, 12, 21),
  ('Masc Sub-15', 'male', NULL, 14, 22),
  ('Masc Sub-17', 'male', NULL, 16, 23),
  ('Masc Sub-19', 'male', NULL, 18, 24),
  ('Masc Sub-21', 'male', NULL, 20, 25),
  ('Masc Sub-23', 'male', NULL, 22, 26),
  ('Fem Sub-9', 'female', NULL, 8, 27),
  ('Fem Sub-11', 'female', NULL, 10, 28),
  ('Fem Sub-13', 'female', NULL, 12, 29),
  ('Fem Sub-15', 'female', NULL, 14, 30),
  ('Fem Sub-17', 'female', NULL, 16, 31),
  ('Fem Sub-19', 'female', NULL, 18, 32),
  ('Fem Sub-21', 'female', NULL, 20, 33),
  ('Fem Sub-23', 'female', NULL, 22, 34);

UPDATE categories
SET max_age = CASE name
    WHEN 'Masc Sub-9' THEN 8
    WHEN 'Masc Sub-11' THEN 10
    WHEN 'Masc Sub-13' THEN 12
    WHEN 'Masc Sub-15' THEN 14
    WHEN 'Masc Sub-17' THEN 16
    WHEN 'Masc Sub-19' THEN 18
    WHEN 'Fem Sub-9' THEN 8
    WHEN 'Fem Sub-11' THEN 10
    WHEN 'Fem Sub-13' THEN 12
    WHEN 'Fem Sub-15' THEN 14
    WHEN 'Fem Sub-17' THEN 16
    WHEN 'Fem Sub-19' THEN 18
    ELSE max_age
  END,
  updated_at = now()
WHERE name IN (
  'Masc Sub-9', 'Masc Sub-11', 'Masc Sub-13', 'Masc Sub-15', 'Masc Sub-17', 'Masc Sub-19',
  'Fem Sub-9', 'Fem Sub-11', 'Fem Sub-13', 'Fem Sub-15', 'Fem Sub-17', 'Fem Sub-19'
);

INSERT INTO categories (name, gender_scope, min_age, max_age, sort_order)
SELECT rc.name, rc.gender_scope, rc.min_age, rc.max_age, rc.sort_order
FROM regulation_categories rc
WHERE NOT EXISTS (
  SELECT 1
  FROM categories c
  WHERE c.name = rc.name
    AND c.gender_scope = rc.gender_scope
    AND c.min_age IS NOT DISTINCT FROM rc.min_age
    AND c.max_age IS NOT DISTINCT FROM rc.max_age
);

UPDATE categories c
SET sort_order = rc.sort_order,
    updated_at = now()
FROM regulation_categories rc
WHERE c.name = rc.name
  AND c.gender_scope = rc.gender_scope
  AND c.min_age IS NOT DISTINCT FROM rc.min_age
  AND c.max_age IS NOT DISTINCT FROM rc.max_age;

INSERT INTO ranking_categories (ranking_id, category_id, is_level_category, level_order)
SELECT
  r.id,
  c.id,
  c.name IN ('Primera', 'Segunda', 'Tercera'),
  CASE c.name
    WHEN 'Primera' THEN 1
    WHEN 'Segunda' THEN 2
    WHEN 'Tercera' THEN 3
    ELSE NULL
  END
FROM rankings r
CROSS JOIN categories c
ON CONFLICT (ranking_id, category_id) DO UPDATE
SET is_level_category = EXCLUDED.is_level_category,
    level_order = EXCLUDED.level_order;

CREATE OR REPLACE FUNCTION enforce_team_roster_competition_rules()
RETURNS trigger AS $$
DECLARE
  roster_count integer;
  allowed_count integer;
  team_ranking_id uuid;
  ranking_code text;
  category_gender gender;
BEGIN
  SELECT t.ranking_id, r.code, c.gender_scope
    INTO team_ranking_id, ranking_code, category_gender
  FROM teams t
  JOIN categories c ON c.id = t.category_id
  LEFT JOIN rankings r ON r.id = t.ranking_id
  WHERE t.id = NEW.team_id;

  IF team_ranking_id IS NOT NULL AND NEW.to_date IS NULL AND EXISTS (
    SELECT 1
    FROM team_rosters existing_roster
    JOIN teams existing_team ON existing_team.id = existing_roster.team_id
    WHERE existing_roster.player_id = NEW.player_id
      AND existing_roster.season_id = NEW.season_id
      AND existing_roster.category_id = NEW.category_id
      AND existing_roster.to_date IS NULL
      AND existing_team.ranking_id = team_ranking_id
      AND existing_roster.team_id <> NEW.team_id
      AND existing_roster.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'A player cannot be active in two teams for the same ranking, season and category.';
  END IF;

  allowed_count := CASE
    WHEN ranking_code = 'CAT' THEN 5
    WHEN ranking_code = 'RFES' AND category_gender = 'female' THEN 5
    WHEN ranking_code = 'RFES' THEN 6
    ELSE NULL
  END;

  IF allowed_count IS NOT NULL AND NEW.to_date IS NULL THEN
    SELECT count(*) INTO roster_count
    FROM team_rosters
    WHERE team_id = NEW.team_id
      AND to_date IS NULL
      AND id <> NEW.id;

    IF roster_count >= allowed_count THEN
      RAISE EXCEPTION 'This team already has the maximum number of active players allowed by its competition rules.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_team_roster_competition_rules_trigger ON team_rosters;
CREATE TRIGGER enforce_team_roster_competition_rules_trigger
BEFORE INSERT OR UPDATE ON team_rosters
FOR EACH ROW EXECUTE FUNCTION enforce_team_roster_competition_rules();
