ALTER TABLE competitions
  ADD COLUMN match_frequency varchar(16) NOT NULL DEFAULT 'biweekly',
  ADD COLUMN preferred_match_weekday integer;

ALTER TABLE competitions
  ADD CONSTRAINT competitions_match_frequency_check
  CHECK (match_frequency IN ('weekly', 'biweekly'));

ALTER TABLE competitions
  ADD CONSTRAINT competitions_preferred_match_weekday_check
  CHECK (preferred_match_weekday IS NULL OR preferred_match_weekday BETWEEN 1 AND 7);
