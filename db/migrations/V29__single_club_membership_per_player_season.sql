ALTER TABLE player_club_memberships
  ADD CONSTRAINT player_club_memberships_player_id_season_id_key UNIQUE (player_id, season_id);
