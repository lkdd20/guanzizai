CREATE TABLE IF NOT EXISTS app_runtime_settings (
  setting_key text PRIMARY KEY,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text NOT NULL DEFAULT 'admin',
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_runtime_settings IS
  'Non-secret runtime switches managed by authenticated administrators. API keys remain in environment variables.';
