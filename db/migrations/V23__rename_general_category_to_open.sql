UPDATE categories
SET name = 'Open'
WHERE name = 'General'
  AND gender_scope = 'not_specified'
  AND min_age IS NULL
  AND max_age IS NULL;

UPDATE competition_categories
SET display_name = 'Open'
WHERE display_name = 'General';

UPDATE teams
SET name = regexp_replace(name, ' General$', ' Open'),
    updated_at = now()
WHERE name ~ ' General$';

UPDATE team_rosters
SET team_name_at_that_time = regexp_replace(team_name_at_that_time, ' General$', ' Open')
WHERE team_name_at_that_time ~ ' General$';

UPDATE team_ties
SET home_team_name_at_time = regexp_replace(home_team_name_at_time, ' General$', ' Open'),
    away_team_name_at_time = regexp_replace(away_team_name_at_time, ' General$', ' Open'),
    updated_at = now()
WHERE home_team_name_at_time ~ ' General$'
   OR away_team_name_at_time ~ ' General$';
