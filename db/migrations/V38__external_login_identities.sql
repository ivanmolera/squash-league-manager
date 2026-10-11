CREATE TABLE external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_identities_provider_subject_key UNIQUE (provider, subject),
  CONSTRAINT external_identities_user_id_provider_key UNIQUE (user_id, provider)
);
