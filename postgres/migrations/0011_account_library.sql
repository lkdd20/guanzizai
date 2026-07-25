ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_bio text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_slug text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_public boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_bio boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_contributions boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_reading_milestones boolean NOT NULL DEFAULT false;

UPDATE users
SET public_slug = 'reader-' || left(replace(id::text, '-', ''), 10)
WHERE public_slug IS NULL OR public_slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS users_public_slug_unique_idx
  ON users (lower(public_slug)) WHERE public_slug IS NOT NULL;

ALTER TABLE reading_progress ADD COLUMN IF NOT EXISTS total_passages integer NOT NULL DEFAULT 1;
ALTER TABLE reading_progress ADD COLUMN IF NOT EXISTS progress_ratio real NOT NULL DEFAULT 0;
ALTER TABLE reading_progress ADD COLUMN IF NOT EXISTS first_opened_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE reading_progress ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE reading_progress DROP CONSTRAINT IF EXISTS reading_progress_total_passages_check;
ALTER TABLE reading_progress ADD CONSTRAINT reading_progress_total_passages_check CHECK (total_passages > 0);
ALTER TABLE reading_progress DROP CONSTRAINT IF EXISTS reading_progress_ratio_check;
ALTER TABLE reading_progress ADD CONSTRAINT reading_progress_ratio_check CHECK (progress_ratio BETWEEN 0 AND 1);

CREATE TABLE IF NOT EXISTS user_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id text NOT NULL,
  work_title text NOT NULL,
  passage_id text NOT NULL,
  passage_anchor text NOT NULL,
  passage_sequence integer NOT NULL CHECK (passage_sequence > 0),
  excerpt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_id, passage_id)
);

CREATE INDEX IF NOT EXISTS user_bookmarks_user_created_idx
  ON user_bookmarks (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id text NOT NULL,
  work_title text NOT NULL,
  content_version text NOT NULL,
  passage_id text NOT NULL,
  passage_anchor text NOT NULL,
  passage_sequence integer NOT NULL CHECK (passage_sequence > 0),
  selected_text text NOT NULL,
  context_before text NOT NULL DEFAULT '',
  context_after text NOT NULL DEFAULT '',
  start_offset integer NOT NULL DEFAULT 0 CHECK (start_offset >= 0),
  end_offset integer NOT NULL DEFAULT 0 CHECK (end_offset >= start_offset),
  color text NOT NULL DEFAULT 'cinnabar' CHECK (color IN ('cinnabar', 'gold', 'ink')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_highlights_user_created_idx
  ON user_highlights (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_highlights_work_idx
  ON user_highlights (user_id, work_id, passage_sequence);

CREATE TABLE IF NOT EXISTS reading_activity_daily (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id text NOT NULL,
  activity_date date NOT NULL DEFAULT current_date,
  active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  opened_count integer NOT NULL DEFAULT 0 CHECK (opened_count >= 0),
  max_progress_ratio real NOT NULL DEFAULT 0 CHECK (max_progress_ratio BETWEEN 0 AND 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_id, activity_date)
);

CREATE INDEX IF NOT EXISTS reading_activity_user_date_idx
  ON reading_activity_daily (user_id, activity_date DESC);
