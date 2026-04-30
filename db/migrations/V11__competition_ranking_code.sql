ALTER TABLE competitions
  ADD COLUMN ranking_code varchar(8) NOT NULL DEFAULT 'none';

UPDATE competitions
SET ranking_code = CASE ranking_scope
  WHEN 'autonomic' THEN 'CAT'
  WHEN 'state' THEN 'ESP'
  WHEN 'psa' THEN 'PSA'
  ELSE 'none'
END;
