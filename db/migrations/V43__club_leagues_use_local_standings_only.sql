UPDATE competitions
SET ranking_scope = 'none', ranking_code = 'none', ranking_id = NULL
WHERE type IN ('individual_league', 'team_league')
  AND host_club_id IS NOT NULL
  AND (ranking_scope <> 'none' OR ranking_code <> 'none' OR ranking_id IS NOT NULL);
