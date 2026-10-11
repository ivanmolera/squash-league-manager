ALTER TABLE players ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE clubs ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE federations ADD COLUMN active boolean NOT NULL DEFAULT true;

CREATE INDEX players_active_idx ON players (active);
CREATE INDEX clubs_active_idx ON clubs (active);
CREATE INDEX federations_active_idx ON federations (active);

CREATE TABLE entity_activity_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(16) NOT NULL CHECK (entity_type IN ('player', 'club', 'federation')),
  entity_id uuid NOT NULL,
  previous_active boolean NOT NULL,
  active boolean NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX entity_activity_changes_entity_type_entity_id_created_at_idx
  ON entity_activity_changes (entity_type, entity_id, created_at);
