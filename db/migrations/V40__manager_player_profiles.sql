ALTER TABLE federations
  ADD COLUMN manager_player_id uuid REFERENCES players(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX federations_manager_player_id_key
  ON federations (manager_player_id);

UPDATE federations AS federation
SET manager_player_id = player.id, updated_at = now()
FROM players AS player
WHERE player.user_id = federation.manager_user_id;

ALTER TABLE clubs
  ADD COLUMN manager_player_id uuid REFERENCES players(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX clubs_manager_player_id_key
  ON clubs (manager_player_id);

UPDATE clubs AS club
SET manager_player_id = player.id, updated_at = now()
FROM players AS player
WHERE player.user_id = club.manager_user_id;
