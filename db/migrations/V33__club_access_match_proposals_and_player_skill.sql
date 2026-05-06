CREATE TYPE match_proposal_type AS ENUM ('friendly', 'competitive');
CREATE TYPE match_proposal_status AS ENUM ('open', 'accepted', 'cancelled', 'completed');

ALTER TABLE clubs
  ADD COLUMN public_court_access boolean NOT NULL DEFAULT true;

ALTER TABLE players
  ADD COLUMN skill_level numeric(3,2) NOT NULL DEFAULT 2.50,
  ADD COLUMN skill_reliability integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT players_skill_level_range CHECK (skill_level >= 0 AND skill_level <= 7),
  ADD CONSTRAINT players_skill_reliability_non_negative CHECK (skill_reliability >= 0);

CREATE TABLE match_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  court_reservation_id uuid NOT NULL UNIQUE REFERENCES court_reservations(id) ON DELETE CASCADE,
  proposer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  proposer_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  acceptor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  acceptor_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  type match_proposal_type NOT NULL DEFAULT 'friendly',
  status match_proposal_status NOT NULL DEFAULT 'open',
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  score_summary text,
  proposer_level_before numeric(3,2),
  proposer_level_after numeric(3,2),
  acceptor_level_before numeric(3,2),
  acceptor_level_after numeric(3,2),
  accepted_at timestamptz,
  completed_at timestamptz,
  completed_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_proposals_distinct_players CHECK (acceptor_player_id IS NULL OR acceptor_player_id <> proposer_player_id),
  CONSTRAINT match_proposals_winner_participant CHECK (
    winner_player_id IS NULL OR winner_player_id = proposer_player_id OR winner_player_id = acceptor_player_id
  )
);

CREATE INDEX idx_match_proposals_club_status ON match_proposals (club_id, status);
CREATE INDEX idx_match_proposals_proposer_status ON match_proposals (proposer_player_id, status);
CREATE INDEX idx_match_proposals_acceptor_status ON match_proposals (acceptor_player_id, status);

CREATE TRIGGER set_match_proposals_updated_at BEFORE UPDATE ON match_proposals
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
