UPDATE team_ties tt
SET home_team_name_at_time = ht.name,
    away_team_name_at_time = at.name,
    home_club_name_at_time = hc.name,
    away_club_name_at_time = ac.name,
    updated_at = now()
FROM seasons s,
     teams ht,
     teams at,
     clubs hc,
     clubs ac
WHERE tt.season_id = s.id
  AND s.status <> 'closed'
  AND tt.home_team_id = ht.id
  AND tt.away_team_id = at.id
  AND ht.club_id = hc.id
  AND at.club_id = ac.id;

UPDATE matches m
SET home_club_name_at_match_time = hc.name,
    updated_at = now()
FROM seasons s,
     clubs hc
WHERE m.season_id = s.id
  AND s.status <> 'closed'
  AND m.home_club_id_at_match_time = hc.id;

UPDATE matches m
SET away_club_name_at_match_time = ac.name,
    updated_at = now()
FROM seasons s,
     clubs ac
WHERE m.season_id = s.id
  AND s.status <> 'closed'
  AND m.away_club_id_at_match_time = ac.id;

UPDATE matches m
SET home_team_name_at_match_time = ht.name,
    home_club_name_at_match_time = hc.name,
    updated_at = now()
FROM seasons s,
     teams ht,
     clubs hc
WHERE m.season_id = s.id
  AND s.status <> 'closed'
  AND m.home_team_id_at_match_time = ht.id
  AND ht.club_id = hc.id;

UPDATE matches m
SET away_team_name_at_match_time = at.name,
    away_club_name_at_match_time = ac.name,
    updated_at = now()
FROM seasons s,
     teams at,
     clubs ac
WHERE m.season_id = s.id
  AND s.status <> 'closed'
  AND m.away_team_id_at_match_time = at.id
  AND at.club_id = ac.id;
