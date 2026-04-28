ALTER TABLE competitions
  ADD COLUMN best_of_sets integer NOT NULL DEFAULT 5;

ALTER TABLE competitions
  ADD CONSTRAINT competitions_best_of_sets_check CHECK (best_of_sets IN (3, 5));
