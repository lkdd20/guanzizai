ALTER TABLE works ADD COLUMN IF NOT EXISTS content_revision text;

UPDATE works
SET content_revision = content_hash || '-' || extract(epoch FROM imported_at)::bigint::text
WHERE content_revision IS NULL OR content_revision = '';

ALTER TABLE works ALTER COLUMN content_revision SET NOT NULL;
ALTER TABLE works ALTER COLUMN content_revision SET DEFAULT gen_random_uuid()::text;

CREATE OR REPLACE FUNCTION bump_public_work_content_revision() RETURNS trigger AS $$
DECLARE
  target_work_id text;
  target_passage_id text;
BEGIN
  IF TG_TABLE_NAME = 'translations' THEN
    IF TG_OP = 'DELETE' AND OLD.status <> 'published' THEN RETURN OLD; END IF;
    IF TG_OP = 'INSERT' AND NEW.status <> 'published' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'published' AND NEW.status <> 'published' THEN RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME = 'work_sections' OR TG_TABLE_NAME = 'passages' THEN
    IF TG_OP = 'DELETE' THEN target_work_id := OLD.work_id; ELSE target_work_id := NEW.work_id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN target_passage_id := OLD.passage_id; ELSE target_passage_id := NEW.passage_id; END IF;
    SELECT work_id INTO target_work_id FROM passages WHERE id = target_passage_id;
  END IF;
  UPDATE works SET content_revision = gen_random_uuid()::text
  WHERE id = target_work_id AND publication_status = 'published';
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS work_sections_revision_trigger ON work_sections;
CREATE TRIGGER work_sections_revision_trigger AFTER INSERT OR UPDATE OR DELETE ON work_sections
FOR EACH ROW EXECUTE FUNCTION bump_public_work_content_revision();
DROP TRIGGER IF EXISTS passages_revision_trigger ON passages;
CREATE TRIGGER passages_revision_trigger AFTER INSERT OR UPDATE OR DELETE ON passages
FOR EACH ROW EXECUTE FUNCTION bump_public_work_content_revision();
DROP TRIGGER IF EXISTS translations_revision_trigger ON translations;
CREATE TRIGGER translations_revision_trigger AFTER INSERT OR UPDATE OR DELETE ON translations
FOR EACH ROW EXECUTE FUNCTION bump_public_work_content_revision();
DROP TRIGGER IF EXISTS passage_enrichments_revision_trigger ON passage_enrichments;
CREATE TRIGGER passage_enrichments_revision_trigger AFTER INSERT OR UPDATE OR DELETE ON passage_enrichments
FOR EACH ROW EXECUTE FUNCTION bump_public_work_content_revision();
