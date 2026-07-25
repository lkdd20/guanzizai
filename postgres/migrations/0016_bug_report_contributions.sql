ALTER TABLE community_contributions DROP CONSTRAINT IF EXISTS community_contributions_kind_check;

ALTER TABLE community_contributions ADD CONSTRAINT community_contributions_kind_check
  CHECK (kind IN ('source_text', 'translation_resource', 'correction', 'authorization', 'institution', 'bug_report'));
