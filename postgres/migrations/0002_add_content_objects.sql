ALTER TABLE works ADD COLUMN IF NOT EXISTS passage_count integer NOT NULL DEFAULT 0;
ALTER TABLE works ADD COLUMN IF NOT EXISTS content_object_key text;
ALTER TABLE works ADD COLUMN IF NOT EXISTS content_encoding text;
ALTER TABLE works ADD COLUMN IF NOT EXISTS content_bytes bigint;
ALTER TABLE works ADD COLUMN IF NOT EXISTS content_object_hash char(64);
ALTER TABLE works ADD COLUMN IF NOT EXISTS reading_start_sequence integer NOT NULL DEFAULT 0;

UPDATE works w SET passage_count = source.count
FROM (SELECT work_id, count(*)::integer AS count FROM passages GROUP BY work_id) source
WHERE w.id = source.work_id AND w.passage_count = 0;

ALTER TABLE works DROP CONSTRAINT IF EXISTS works_passage_count_check;
ALTER TABLE works ADD CONSTRAINT works_passage_count_check CHECK (passage_count >= 0);
ALTER TABLE works DROP CONSTRAINT IF EXISTS works_content_bytes_check;
ALTER TABLE works ADD CONSTRAINT works_content_bytes_check CHECK (content_bytes IS NULL OR content_bytes >= 0);
