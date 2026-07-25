CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_identities (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('github', 'google', 'email')),
  provider_subject text NOT NULL,
  provider_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id text NOT NULL,
  content_version text NOT NULL,
  passage_id text NOT NULL,
  passage_sequence integer NOT NULL CHECK (passage_sequence > 0),
  intra_passage_ratio real NOT NULL DEFAULT 0 CHECK (intra_passage_ratio BETWEEN 0 AND 1),
  reader_mode text NOT NULL CHECK (reader_mode IN ('original', 'plain', 'parallel')),
  writing_direction text NOT NULL DEFAULT 'horizontal' CHECK (writing_direction IN ('horizontal', 'vertical')),
  device_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_id)
);

CREATE INDEX IF NOT EXISTS user_identities_user_idx ON user_identities (user_id);
CREATE INDEX IF NOT EXISTS reading_progress_user_updated_idx ON reading_progress (user_id, updated_at DESC);
