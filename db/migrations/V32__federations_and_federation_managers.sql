ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manager_fed';

CREATE TABLE federations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(12) NOT NULL UNIQUE,
  name text NOT NULL,
  contact_name text,
  address text,
  city text,
  province text,
  postal_code varchar(16),
  phone text,
  mobile text,
  email text,
  website_url text,
  logo_url text,
  ranking_id uuid REFERENCES rankings(id) ON DELETE SET NULL,
  manager_user_id uuid UNIQUE REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_federations_updated_at BEFORE UPDATE ON federations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE clubs
  ADD COLUMN federation_id uuid REFERENCES federations(id) ON DELETE SET NULL;

ALTER TABLE competitions
  ADD COLUMN organizer_federation_id uuid REFERENCES federations(id) ON DELETE SET NULL;

CREATE INDEX clubs_federation_id_idx ON clubs(federation_id);
CREATE INDEX competitions_organizer_federation_id_idx ON competitions(organizer_federation_id);

CREATE TEMP TABLE federation_seed (
  code varchar(12) NOT NULL,
  name text NOT NULL,
  contact_name text,
  address text,
  city text,
  province text,
  postal_code varchar(16),
  phone text,
  mobile text,
  email text,
  website_url text
) ON COMMIT DROP;

INSERT INTO federation_seed (code, name, contact_name, address, city, province, postal_code, phone, mobile, email, website_url) VALUES
  ('RFES', 'Real Federación Española de Squash', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('AND', 'Federación Andaluza de Squash', 'Pedro Ríos', 'C/ Río Guadalete, 9', 'Mijas-Costa', 'Málaga', '29651', '952.475.770', '607521221', 'squashandaluz@hotmail.com', 'https://www.squashandaluz.org'),
  ('ARA', 'Federación Aragonesa de Squash', NULL, NULL, NULL, 'Aragón', NULL, NULL, NULL, NULL, NULL),
  ('AST', 'Federación Asturiana de Squash', NULL, 'C/ Dolores Ibarruri, 39 bajo (Casa del deporte 2)', 'Gijón', 'P. Asturias', '33211', NULL, NULL, 'fspa@wanadoo.es', NULL),
  ('BAL', 'Delegación Balear de Squash', 'Roció Nigorra', 'Avda. Rey Jaime I, 158', 'Santa Ponsa - Calvià', 'Illes Balears', '07180', NULL, '654.018.209', 'balearsquash@gmail.com', NULL),
  ('CAN', 'Federación Canaria de Squash', 'Rafael Jorge Arrimarlo', 'Palacio Munic. Deportes. C/ Fernando Barajas Prat s/n', 'Santa Cruz de Tenerife', 'I. Canarias', '38005', NULL, '699.090.920', 'squashcanarias@gmail.com', 'https://www.squashcanarias.com'),
  ('CNT', 'Federación Cántabra de Squash', 'Ignacio Rodríguez', 'Avda. de Pontejos, 13 portal B 2º I', 'Santander', 'Santander', '39005', NULL, '659.483.684', 'federacion@squashcantabria.com', 'https://www.squashcantabria.com'),
  ('CLM', 'Delegación Squash Castilla La Mancha', 'Julián Alberto Niño', 'Av. Mediterráneo s/n. Pabellón Polideportivo San Fernando', 'Cuenca', 'Cuenca', '16004', NULL, '647.408.224', 'julianalbertonino@hotmail.com', 'https://www.clmsquash.com'),
  ('CYL', 'Federación de Squash Castilla y León', 'Roberto Martínez Cebrián', 'C/ La Revenga, 9 1º C', 'Burgos', 'Burgos', '09006', NULL, '629.258.677', 'fsquashcyl@gmail.com', 'https://www.squashpalencia.com/fsc'),
  ('CAT', 'Federación Catalana de Squash', 'Joan Casahuga', 'C/ Marconi, 240', 'Terrassa', 'Barcelona', '08224', '93.307.95.60', NULL, 'info@esquaix.cat', 'https://www.squash.cat'),
  ('CEU', 'Delegación de Squash de Ceuta', NULL, NULL, 'Ceuta', 'Ceuta', NULL, NULL, NULL, NULL, NULL),
  ('EXT', 'Federación Extremeña de Squash', NULL, NULL, NULL, 'Extremadura', NULL, NULL, NULL, NULL, NULL),
  ('GAL', 'Federación Gallega de Squash', 'Catuxa Codesido', 'C/ Fotógrafo Luis Ksado 17, planta 1ª, local 11', 'Vigo', 'Pontevedra', '36209', '986.202.501', '698187244', 'info@fgsquash.org', 'https://www.fgsquash.org'),
  ('MAD', 'Federación Madrileña de Squash', 'Belén Etchechouri', 'C/ Arroyo del Olivar, 49', 'Madrid', 'Madrid', '28018', '91.581.15.79', NULL, 'fms@fms.es', 'https://www.fms.es'),
  ('MEL', 'Delegación de Squash de Melilla', NULL, NULL, 'Melilla', 'Melilla', NULL, NULL, NULL, NULL, NULL),
  ('MUR', 'Federación de Squash Murcia', 'Ángel Pedro Pérez', 'C/ La Pinta, 14', 'San Pedro del Pinatar', 'Murcia', '30740', NULL, '616.513.565', 'fsrmurcia@gmail.com', 'https://www.squashmurcia.com'),
  ('NAV', 'Delegación Navarra de Squash', 'Cristóbal Tellechea', 'C/ Madrid, 2. Bajo A', 'Pamplona', 'Navarra', '31016', NULL, '625.933.082', 'cristobaltelletxea@hotmail.com', 'https://www.squashnavarro.blogspot.com'),
  ('PVA', 'Federación Vasca de Squash', 'Mayte Garmendia', 'Edificio CPT. Avda. de los Chopos s/n', 'Getxo', 'Vizcaya', '48991', '946.232.689', NULL, 'squash@euskalkirola.eus', 'https://www.squasheuskadi.com'),
  ('RIO', 'Delegación Riojana', 'Álvaro Jurado Bernedo', 'C/ Sta. María de la Cabeza, 3 2º A', 'Villanueva de Iregua', 'La Rioja', '26140', NULL, '685.829.431', 'riojasquash@gmail.com', NULL),
  ('VAL', 'Federación Squash Comunidad Valenciana', 'Néstor Sanchis', 'San José de Calasanz, 18', 'Algemesí', 'Valencia', '46680', NULL, '620.888.640', 'fsquashcv@fsquashcv.com', 'https://www.fsquashcv.com');

INSERT INTO federations (code, name, contact_name, address, city, province, postal_code, phone, mobile, email, website_url, ranking_id, logo_url)
SELECT
  fs.code,
  fs.name,
  fs.contact_name,
  fs.address,
  fs.city,
  fs.province,
  fs.postal_code,
  fs.phone,
  fs.mobile,
  fs.email,
  fs.website_url,
  r.id,
  r.logo_url
FROM federation_seed fs
LEFT JOIN rankings r ON r.code = fs.code
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    contact_name = EXCLUDED.contact_name,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    province = EXCLUDED.province,
    postal_code = EXCLUDED.postal_code,
    phone = EXCLUDED.phone,
    mobile = EXCLUDED.mobile,
    email = EXCLUDED.email,
    website_url = EXCLUDED.website_url,
    ranking_id = EXCLUDED.ranking_id,
    logo_url = EXCLUDED.logo_url,
    updated_at = now();

UPDATE clubs c
SET federation_id = f.id,
    updated_at = now()
FROM federations f
WHERE f.code = CASE
  WHEN lower(coalesce(c.province, c.city, '')) IN ('barcelona', 'girona', 'lleida', 'tarragona') THEN 'CAT'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('madrid') THEN 'MAD'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('valencia', 'castellon', 'castelló', 'alicante', 'alacant') THEN 'VAL'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('murcia') THEN 'MUR'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('malaga', 'málaga', 'sevilla', 'cordoba', 'córdoba', 'granada', 'huelva', 'jaen', 'jaén', 'cadiz', 'cádiz', 'almeria', 'almería') THEN 'AND'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('pontevedra', 'a coruña', 'coruña', 'lugo', 'ourense') THEN 'GAL'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('asturias', 'p. asturias') THEN 'AST'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('illes balears', 'baleares', 'ii. baleares') THEN 'BAL'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('las palmas', 'santa cruz de tenerife', 'tenerife', 'i. canarias') THEN 'CAN'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('cantabria', 'santander') THEN 'CNT'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('cuenca', 'toledo', 'ciudad real', 'albacete', 'guadalajara') THEN 'CLM'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('burgos', 'palencia', 'valladolid', 'leon', 'león', 'zamora', 'salamanca', 'avila', 'ávila', 'segovia', 'soria') THEN 'CYL'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('navarra') THEN 'NAV'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('vizcaya', 'bizkaia', 'guipuzcoa', 'guipúzcoa', 'gipuzkoa', 'alava', 'álava', 'araba') THEN 'PVA'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('la rioja') THEN 'RIO'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('zaragoza', 'huesca', 'teruel', 'aragon', 'aragón') THEN 'ARA'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('caceres', 'cáceres', 'badajoz', 'extremadura') THEN 'EXT'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('ceuta') THEN 'CEU'
  WHEN lower(coalesce(c.province, c.city, '')) IN ('melilla') THEN 'MEL'
  ELSE NULL
END
  AND c.federation_id IS DISTINCT FROM f.id;
