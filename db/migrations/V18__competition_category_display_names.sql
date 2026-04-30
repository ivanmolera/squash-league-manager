ALTER TABLE competition_categories
  ADD COLUMN display_name text;

UPDATE competition_categories cc
SET display_name = c.name
FROM categories c
WHERE c.id = cc.category_id;

ALTER TABLE competition_categories
  ALTER COLUMN display_name SET NOT NULL;

ALTER TABLE competition_categories
  DROP CONSTRAINT IF EXISTS competition_categories_competition_id_category_id_key;

ALTER TABLE competition_categories
  ADD CONSTRAINT competition_categories_competition_id_display_name_key UNIQUE (competition_id, display_name);
