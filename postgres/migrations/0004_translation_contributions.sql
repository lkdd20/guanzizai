ALTER TABLE translations ADD COLUMN IF NOT EXISTS contributor_name text;
ALTER TABLE translations ADD COLUMN IF NOT EXISTS contribution_id uuid;

CREATE TABLE IF NOT EXISTS translation_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  passage_id text NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
  contributor_user_id text NOT NULL,
  contributor_provider text NOT NULL,
  contributor_email text NOT NULL,
  contributor_name text NOT NULL,
  translation_text text NOT NULL,
  translation_hash char(64) NOT NULL,
  source_content_hash char(64) NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('original', 'licensed', 'other')),
  source_name text,
  source_url text,
  license_note text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'needs_changes', 'approved', 'rejected')),
  reviewer text,
  review_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE translations DROP CONSTRAINT IF EXISTS translations_contribution_id_fkey;
ALTER TABLE translations ADD CONSTRAINT translations_contribution_id_fkey
  FOREIGN KEY (contribution_id) REFERENCES translation_contributions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS translation_contributions_status_idx
  ON translation_contributions (status, submitted_at);
CREATE INDEX IF NOT EXISTS translation_contributions_user_idx
  ON translation_contributions (contributor_user_id, submitted_at DESC);
