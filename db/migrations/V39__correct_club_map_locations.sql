-- Venue positions from OpenStreetMap, cross-checked against the clubs' published addresses.
-- Mèlich: https://www.rfet.es/es/club/melich-club-esportiu and OSM way 448931463.
UPDATE clubs
SET address = 'Avinguda Onze de Setembre, 7', city = 'Sant Just Desvern',
    latitude = 41.38824, longitude = 2.07063,
    geocoding_query = 'Avinguda Onze de Setembre, 7, 08960, Sant Just Desvern, Barcelona, España',
    geocoded_at = now(), updated_at = now()
WHERE id = '4ba476df-4af3-441b-87aa-0724d29a4d33' AND name = 'Can Mèlich'
  AND address = 'Avinguda Onze de Setembre, s/n' AND latitude IS NULL;

-- Bonasport: https://bonasport.com/ca/contacte/ and OSM way 450577882.
UPDATE clubs
SET latitude = 41.41061, longitude = 2.12843,
    geocoding_query = 'Carrer Vista Bella, 11, 08022, Barcelona, Barcelona, España',
    geocoded_at = now(), updated_at = now()
WHERE id = 'e4ba6724-9736-4c62-8548-058852389d77' AND name = 'Bonasport'
  AND latitude = 41.4109685 AND longitude = 2.1295821;

-- The Rosalía de Castro venue is in O Milladoiro (Ames), not Santiago city.
-- https://www.squashsantiago.com/contactanos/ and OSM node 6178719446.
UPDATE clubs
SET city = 'O Milladoiro', latitude = 42.84138, longitude = -8.57901,
    geocoding_query = 'Avenida Rosalía de Castro, 59, 15895, O Milladoiro, Ames, A Coruña, España',
    geocoded_at = now(), updated_at = now()
WHERE id = 'd6cd8135-d521-4842-bc35-215b5787a45f' AND name = 'Squash Club Santiago'
  AND city = 'Santiago de Compostela' AND latitude = 42.8814572 AND longitude = -8.5459201;

-- Tipi Park: https://www.tipiparksports.com/Page.aspx?id=9 and OSM way 253313075.
UPDATE clubs
SET latitude = 41.81226, longitude = 3.01976,
    geocoding_query = 'Carretera Santa Cristina - Platja d’Aro, km 2, 17246, Santa Cristina d’Aro, Girona, España',
    geocoded_at = now(), updated_at = now()
WHERE id = 'b364fdd0-0af0-4c0f-b8e6-317823018c6f' AND name = 'Tipi Park'
  AND latitude = 41.8358346 AND longitude = 3.0211036;
