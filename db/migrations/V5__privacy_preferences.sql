ALTER TABLE players
  ADD COLUMN show_contact_public boolean NOT NULL DEFAULT true,
  ADD COLUMN show_physical_public boolean NOT NULL DEFAULT true;

ALTER TABLE clubs
  ADD COLUMN show_contact_public boolean NOT NULL DEFAULT true;

ALTER TABLE teams
  ADD COLUMN show_roster_public boolean NOT NULL DEFAULT true;
