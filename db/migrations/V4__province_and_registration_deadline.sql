ALTER TABLE clubs
  ADD COLUMN province text;

ALTER TABLE competitions
  ADD COLUMN registration_deadline timestamptz;

CREATE INDEX idx_clubs_province_name ON clubs (province, name);
CREATE INDEX idx_competitions_starts_name ON competitions (starts_at, name);
CREATE INDEX idx_competitions_registration_deadline ON competitions (registration_deadline);
