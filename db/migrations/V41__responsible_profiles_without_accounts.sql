ALTER TABLE players
  ADD COLUMN is_sports_profile boolean NOT NULL DEFAULT true,
  ADD COLUMN contact_email text,
  ADD COLUMN contact_phone text;

CREATE INDEX players_contact_email_lower_idx
  ON players (lower(contact_email))
  WHERE contact_email IS NOT NULL;
