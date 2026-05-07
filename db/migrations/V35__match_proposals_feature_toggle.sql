INSERT INTO app_feature_settings (feature_key, enabled)
VALUES ('match_proposals', true)
ON CONFLICT (feature_key) DO NOTHING;
