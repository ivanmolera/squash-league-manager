CREATE TEMP TABLE official_categories (
  name text NOT NULL,
  gender_scope gender NOT NULL,
  min_age integer,
  max_age integer,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO official_categories (name, gender_scope, min_age, max_age, sort_order) VALUES
  ('General', 'not_specified', NULL, NULL, 1),
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
  ('Masc Sub-9', 'male', NULL, 9, 14),
  ('Masc Sub-11', 'male', NULL, 11, 15),
  ('Masc Sub-13', 'male', NULL, 13, 16),
  ('Masc Sub-15', 'male', NULL, 15, 17),
  ('Masc Sub-17', 'male', NULL, 17, 18),
  ('Masc Sub-19', 'male', NULL, 19, 19),
  ('Fem Sub-9', 'female', NULL, 9, 20),
  ('Fem Sub-11', 'female', NULL, 11, 21),
  ('Fem Sub-13', 'female', NULL, 13, 22),
  ('Fem Sub-15', 'female', NULL, 15, 23),
  ('Fem Sub-17', 'female', NULL, 17, 24),
  ('Fem Sub-19', 'female', NULL, 19, 25);

CREATE TEMP TABLE category_aliases (
  source_name text NOT NULL,
  source_gender_scope gender NOT NULL,
  source_min_age integer,
  source_max_age integer,
  target_name text NOT NULL,
  target_gender_scope gender NOT NULL,
  target_min_age integer,
  target_max_age integer
) ON COMMIT DROP;

INSERT INTO category_aliases VALUES
  ('Masculino Primera', 'male', NULL, NULL, 'Primera', 'not_specified', NULL, NULL),
  ('Masculino Segunda', 'male', NULL, NULL, 'Segunda', 'not_specified', NULL, NULL),
  ('Masculino Tercera', 'male', NULL, NULL, 'Tercera', 'not_specified', NULL, NULL),
  ('Veteranos +35', 'not_specified', 35, NULL, 'Masc +35', 'male', 35, NULL),
  ('Juvenil Sub-18', 'not_specified', NULL, 18, 'Masc Sub-19', 'male', NULL, 19);

INSERT INTO categories (name, gender_scope, min_age, max_age, sort_order)
SELECT name, gender_scope, min_age, max_age, sort_order
FROM official_categories
WHERE NOT EXISTS (
  SELECT 1
  FROM categories existing
  WHERE existing.name = official_categories.name
    AND existing.gender_scope = official_categories.gender_scope
    AND existing.min_age IS NOT DISTINCT FROM official_categories.min_age
    AND existing.max_age IS NOT DISTINCT FROM official_categories.max_age
);

WITH category_map AS (
  SELECT
    source.id AS source_id,
    target.id AS target_id,
    aliases.source_name,
    aliases.target_name
  FROM category_aliases aliases
  JOIN categories source
    ON source.name = aliases.source_name
   AND source.gender_scope = aliases.source_gender_scope
   AND source.min_age IS NOT DISTINCT FROM aliases.source_min_age
   AND source.max_age IS NOT DISTINCT FROM aliases.source_max_age
  JOIN categories target
    ON target.name = aliases.target_name
   AND target.gender_scope = aliases.target_gender_scope
   AND target.min_age IS NOT DISTINCT FROM aliases.target_min_age
   AND target.max_age IS NOT DISTINCT FROM aliases.target_max_age
  WHERE source.id <> target.id
)
UPDATE competition_categories cc
SET category_id = category_map.target_id
FROM category_map
WHERE cc.category_id = category_map.source_id
  AND NOT EXISTS (
    SELECT 1
    FROM competition_categories existing
    WHERE existing.competition_id = cc.competition_id
      AND existing.category_id = category_map.target_id
  );

WITH category_map AS (
  SELECT
    source.id AS source_id,
    target.id AS target_id,
    aliases.source_name,
    aliases.target_name
  FROM category_aliases aliases
  JOIN categories source
    ON source.name = aliases.source_name
   AND source.gender_scope = aliases.source_gender_scope
   AND source.min_age IS NOT DISTINCT FROM aliases.source_min_age
   AND source.max_age IS NOT DISTINCT FROM aliases.source_max_age
  JOIN categories target
    ON target.name = aliases.target_name
   AND target.gender_scope = aliases.target_gender_scope
   AND target.min_age IS NOT DISTINCT FROM aliases.target_min_age
   AND target.max_age IS NOT DISTINCT FROM aliases.target_max_age
  WHERE source.id <> target.id
)
UPDATE teams t
SET category_id = category_map.target_id,
    name = replace(t.name, category_map.source_name, category_map.target_name),
    updated_at = now()
FROM category_map
WHERE t.category_id = category_map.source_id;

WITH category_map AS (
  SELECT
    source.id AS source_id,
    target.id AS target_id,
    aliases.source_name,
    aliases.target_name
  FROM category_aliases aliases
  JOIN categories source
    ON source.name = aliases.source_name
   AND source.gender_scope = aliases.source_gender_scope
   AND source.min_age IS NOT DISTINCT FROM aliases.source_min_age
   AND source.max_age IS NOT DISTINCT FROM aliases.source_max_age
  JOIN categories target
    ON target.name = aliases.target_name
   AND target.gender_scope = aliases.target_gender_scope
   AND target.min_age IS NOT DISTINCT FROM aliases.target_min_age
   AND target.max_age IS NOT DISTINCT FROM aliases.target_max_age
  WHERE source.id <> target.id
)
UPDATE team_rosters tr
SET category_id = category_map.target_id,
    team_name_at_that_time = replace(tr.team_name_at_that_time, category_map.source_name, category_map.target_name)
FROM category_map
WHERE tr.category_id = category_map.source_id;

UPDATE categories c
SET sort_order = official_categories.sort_order,
    updated_at = now()
FROM official_categories
WHERE c.name = official_categories.name
  AND c.gender_scope = official_categories.gender_scope
  AND c.min_age IS NOT DISTINCT FROM official_categories.min_age
  AND c.max_age IS NOT DISTINCT FROM official_categories.max_age;

UPDATE team_ties tt
SET home_team_name_at_time = ht.name,
    away_team_name_at_time = at.name,
    home_club_name_at_time = hc.name,
    away_club_name_at_time = ac.name,
    updated_at = now()
FROM seasons s,
     teams ht,
     teams at,
     clubs hc,
     clubs ac
WHERE tt.season_id = s.id
  AND s.status <> 'closed'
  AND tt.home_team_id = ht.id
  AND tt.away_team_id = at.id
  AND ht.club_id = hc.id
  AND at.club_id = ac.id;

UPDATE matches m
SET home_team_name_at_match_time = ht.name,
    home_club_name_at_match_time = hc.name,
    updated_at = now()
FROM seasons s,
     teams ht,
     clubs hc
WHERE m.season_id = s.id
  AND s.status <> 'closed'
  AND m.home_team_id_at_match_time = ht.id
  AND ht.club_id = hc.id;

UPDATE matches m
SET away_team_name_at_match_time = at.name,
    away_club_name_at_match_time = ac.name,
    updated_at = now()
FROM seasons s,
     teams at,
     clubs ac
WHERE m.season_id = s.id
  AND s.status <> 'closed'
  AND m.away_team_id_at_match_time = at.id
  AND at.club_id = ac.id;

DELETE FROM categories c
USING category_aliases aliases
WHERE c.name = aliases.source_name
  AND c.gender_scope = aliases.source_gender_scope
  AND c.min_age IS NOT DISTINCT FROM aliases.source_min_age
  AND c.max_age IS NOT DISTINCT FROM aliases.source_max_age
  AND NOT EXISTS (SELECT 1 FROM competition_categories cc WHERE cc.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM team_rosters tr WHERE tr.category_id = c.id);
