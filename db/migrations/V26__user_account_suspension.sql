ALTER TABLE app_users
  ADD COLUMN suspended_at TIMESTAMPTZ,
  ADD COLUMN suspended_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN suspension_reason TEXT;

CREATE INDEX idx_app_users_suspended_at ON app_users(suspended_at);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
