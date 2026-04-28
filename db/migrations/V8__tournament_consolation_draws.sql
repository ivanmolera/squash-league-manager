ALTER TYPE match_type ADD VALUE IF NOT EXISTS 'tournament_consolation';
ALTER TYPE match_type ADD VALUE IF NOT EXISTS 'tournament_third_place';

ALTER TABLE tournament_draw_entries
  ADD COLUMN bracket_type text NOT NULL DEFAULT 'main';

ALTER TABLE tournament_draw_entries
  DROP CONSTRAINT IF EXISTS tournament_draw_entries_competition_category_id_bracket_position_key;

ALTER TABLE tournament_draw_entries
  DROP CONSTRAINT IF EXISTS tournament_draw_entries_check;

ALTER TABLE tournament_draw_entries
  ADD CONSTRAINT tournament_draw_entries_player_check
  CHECK ((is_bye AND player_id IS NULL) OR NOT is_bye);

ALTER TABLE tournament_draw_entries
  ADD CONSTRAINT tournament_draw_entries_category_bracket_position_key
  UNIQUE (competition_category_id, bracket_type, bracket_position);
