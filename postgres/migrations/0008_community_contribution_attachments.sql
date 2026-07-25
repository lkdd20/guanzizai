ALTER TABLE community_contributions
  ADD COLUMN IF NOT EXISTS attachment_key text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_content_type text,
  ADD COLUMN IF NOT EXISTS attachment_bytes bigint,
  ADD COLUMN IF NOT EXISTS attachment_sha256 char(64),
  ADD COLUMN IF NOT EXISTS attachment_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS attachment_uploaded_at timestamptz;

ALTER TABLE community_contributions DROP CONSTRAINT IF EXISTS community_contributions_attachment_status_check;
ALTER TABLE community_contributions ADD CONSTRAINT community_contributions_attachment_status_check
  CHECK (attachment_status IN ('none', 'uploaded', 'deleted'));

ALTER TABLE community_contributions DROP CONSTRAINT IF EXISTS community_contributions_attachment_metadata_check;
ALTER TABLE community_contributions ADD CONSTRAINT community_contributions_attachment_metadata_check
  CHECK ((attachment_status = 'none' AND attachment_key IS NULL)
    OR (attachment_status IN ('uploaded', 'deleted') AND attachment_key IS NOT NULL));

CREATE INDEX IF NOT EXISTS community_contributions_attachment_idx
  ON community_contributions (attachment_status, submitted_at DESC);
