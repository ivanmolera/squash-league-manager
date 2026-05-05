CREATE TYPE player_link_request_status AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE players
  ADD COLUMN merged_into_player_id uuid,
  ADD COLUMN merged_at timestamptz,
  ADD CONSTRAINT players_merged_into_player_id_fkey
    FOREIGN KEY (merged_into_player_id) REFERENCES players(id) ON DELETE SET NULL;

CREATE INDEX players_merged_into_player_id_idx ON players(merged_into_player_id);

CREATE TABLE player_link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  candidate_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  requested_first_name text NOT NULL,
  requested_last_name text NOT NULL,
  requested_email text NOT NULL,
  match_score integer NOT NULL DEFAULT 0,
  match_reasons jsonb,
  status player_link_request_status NOT NULL DEFAULT 'pending',
  reviewed_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, candidate_player_id, status)
);

CREATE INDEX player_link_requests_status_idx ON player_link_requests(status);
CREATE INDEX player_link_requests_candidate_player_id_idx ON player_link_requests(candidate_player_id);

CREATE TABLE player_merge_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  duplicate_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  merged_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  before_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (duplicate_player_id)
);

CREATE INDEX player_merge_logs_primary_player_id_idx ON player_merge_logs(primary_player_id);
