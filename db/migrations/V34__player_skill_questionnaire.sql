ALTER TABLE players
  ADD COLUMN skill_level_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN skill_questionnaire jsonb;
