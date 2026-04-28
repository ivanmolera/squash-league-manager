CREATE TYPE ranking_scope AS ENUM ('none', 'autonomic', 'state', 'psa');

ALTER TABLE players
  ADD COLUMN receives_match_communications boolean NOT NULL DEFAULT false;

ALTER TABLE competitions
  ADD COLUMN ranking_scope ranking_scope NOT NULL DEFAULT 'none';

UPDATE matches m
SET scheduled_at = COALESCE(c.starts_at, now())
  + ((GREATEST(COALESCE(m.round_number, 1), 1) - 1)::text || ' days')::interval
  + (((GREATEST(COALESCE(m.bracket_position, m.match_order, 1), 1) - 1) % 6 * 2 + 9)::text || ' hours')::interval
FROM competitions c
WHERE m.competition_id = c.id
  AND c.type = 'tournament'
  AND m.scheduled_at IS NULL;
