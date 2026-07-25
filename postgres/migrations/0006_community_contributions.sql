CREATE TABLE IF NOT EXISTS community_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('source_text', 'translation_resource', 'correction', 'authorization', 'institution')),
  work_id text REFERENCES works(id) ON DELETE SET NULL,
  work_title text NOT NULL,
  contributor_user_id text,
  contributor_provider text,
  contributor_email text NOT NULL,
  contributor_name text NOT NULL,
  organization_name text,
  title text NOT NULL,
  description text NOT NULL,
  source_name text,
  source_url text,
  license_note text NOT NULL,
  public_credit boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'needs_changes', 'accepted', 'rejected')),
  reviewer text,
  review_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS community_contributions_status_idx
  ON community_contributions (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS community_contributions_user_idx
  ON community_contributions (contributor_user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS community_contributions_email_idx
  ON community_contributions (contributor_email, submitted_at DESC);
