CREATE TABLE rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(8) NOT NULL UNIQUE,
  name text NOT NULL,
  scope ranking_scope NOT NULL DEFAULT 'none',
  logo_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO rankings (code, name, scope, logo_url, sort_order) VALUES
  ('AND', 'Andalucía', 'autonomic', '/images/flags/and.svg', 10),
  ('ARA', 'Aragón', 'autonomic', '/images/flags/ara.svg', 20),
  ('AST', 'Asturias', 'autonomic', '/images/flags/ast.svg', 30),
  ('BAL', 'Illes Balears', 'autonomic', '/images/flags/bal.svg', 40),
  ('CAN', 'Canarias', 'autonomic', '/images/flags/can.svg', 50),
  ('CNT', 'Cantabria', 'autonomic', '/images/flags/cnt.svg', 60),
  ('CLM', 'Castilla-La Mancha', 'autonomic', '/images/flags/clm.svg', 70),
  ('CYL', 'Castilla y León', 'autonomic', '/images/flags/cyl.svg', 80),
  ('CAT', 'Catalunya', 'autonomic', '/images/flags/cat.svg', 90),
  ('VAL', 'Comunitat Valenciana', 'autonomic', '/images/flags/val.svg', 100),
  ('EXT', 'Extremadura', 'autonomic', '/images/flags/ext.svg', 110),
  ('GAL', 'Galicia', 'autonomic', '/images/flags/gal.svg', 120),
  ('MAD', 'Madrid', 'autonomic', '/images/flags/mad.svg', 130),
  ('MUR', 'Murcia', 'autonomic', '/images/flags/mur.svg', 140),
  ('NAV', 'Navarra', 'autonomic', '/images/flags/nav.svg', 150),
  ('PVA', 'País Vasco', 'autonomic', '/images/flags/pva.svg', 160),
  ('RIO', 'La Rioja', 'autonomic', '/images/flags/rio.svg', 170),
  ('CEU', 'Ceuta', 'autonomic', '/images/flags/ceu.svg', 180),
  ('MEL', 'Melilla', 'autonomic', '/images/flags/mel.svg', 190),
  ('RFES', 'RFES', 'state', '/images/rfes.png', 200),
  ('PSA', 'PSA', 'psa', '/images/psa_logo2.png', 210)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    scope = EXCLUDED.scope,
    logo_url = EXCLUDED.logo_url,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

ALTER TABLE competitions
  ADD COLUMN ranking_id uuid REFERENCES rankings(id) ON DELETE SET NULL;

UPDATE competitions c
SET ranking_id = r.id
FROM rankings r
WHERE c.ranking_code = r.code;

CREATE INDEX competitions_ranking_id_idx ON competitions(ranking_id);

ALTER TABLE teams
  ADD COLUMN ranking_id uuid REFERENCES rankings(id) ON DELETE SET NULL;

UPDATE teams t
SET ranking_id = ranked_competitions.ranking_id
FROM (
  SELECT DISTINCT ON (c.season_id, cc.category_id)
    c.season_id,
    cc.category_id,
    c.ranking_id
  FROM competitions c
  JOIN competition_categories cc ON cc.competition_id = c.id
  WHERE c.type = 'team_league'
    AND c.ranking_id IS NOT NULL
  ORDER BY c.season_id, cc.category_id, c.starts_at DESC NULLS LAST, c.created_at DESC
) ranked_competitions
WHERE t.season_id = ranked_competitions.season_id
  AND t.category_id = ranked_competitions.category_id;

CREATE INDEX teams_ranking_id_idx ON teams(ranking_id);

CREATE TABLE ranking_categories (
  ranking_id uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_level_category boolean NOT NULL DEFAULT false,
  level_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ranking_id, category_id),
  CHECK (level_order IS NULL OR level_order > 0)
);

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

CREATE TABLE player_ranking_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  ranking_id uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  is_level_category boolean NOT NULL DEFAULT false,
  level_order integer,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  source varchar(32) NOT NULL DEFAULT 'manual',
  notes text,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, ranking_id, season_id, category_id, valid_from),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CHECK (level_order IS NULL OR level_order > 0)
);

CREATE INDEX player_ranking_categories_player_idx ON player_ranking_categories(player_id);
CREATE INDEX player_ranking_categories_ranking_category_idx ON player_ranking_categories(ranking_id, category_id);

CREATE UNIQUE INDEX player_ranking_categories_one_active_level_idx
  ON player_ranking_categories(player_id, ranking_id, season_id)
  WHERE valid_to IS NULL AND is_level_category;
