UPDATE seasons
SET ends_at = DATE '2026-08-31', updated_at = now()
WHERE name = '2025/26' AND ends_at < DATE '2026-08-31';

INSERT INTO seasons (name, starts_at, ends_at, status)
VALUES ('2026/27', DATE '2026-09-01', DATE '2027-08-31', 'active')
ON CONFLICT (name) DO UPDATE
SET starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    updated_at = now();

UPDATE competitions AS tournament
SET season_id = season.id, updated_at = now()
FROM seasons AS season
WHERE tournament.type = 'tournament'
  AND tournament.starts_at >= TIMESTAMPTZ '2026-01-01 00:00:00+00'
  AND tournament.starts_at < TIMESTAMPTZ '2026-09-01 00:00:00+00'
  AND season.name = '2025/26'
  AND tournament.season_id <> season.id;

UPDATE competitions AS tournament
SET season_id = season.id, updated_at = now()
FROM seasons AS season
WHERE tournament.type = 'tournament'
  AND tournament.starts_at >= TIMESTAMPTZ '2026-09-01 00:00:00+00'
  AND tournament.starts_at < TIMESTAMPTZ '2027-09-01 00:00:00+00'
  AND season.name = '2026/27'
  AND tournament.season_id <> season.id;
