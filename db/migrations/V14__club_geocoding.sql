ALTER TABLE clubs
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN geocoded_at timestamptz,
  ADD COLUMN geocoding_query text;
