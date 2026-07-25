ALTER TABLE work_sections ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'body';
ALTER TABLE work_sections ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;
ALTER TABLE work_sections ADD COLUMN IF NOT EXISTS parent_section_key text;
ALTER TABLE work_sections ADD COLUMN IF NOT EXISTS end_sequence integer;

ALTER TABLE work_sections DROP CONSTRAINT IF EXISTS work_sections_work_id_sequence_key;
ALTER TABLE work_sections DROP CONSTRAINT IF EXISTS work_sections_kind_check;
ALTER TABLE work_sections ADD CONSTRAINT work_sections_kind_check
  CHECK (kind IN ('body', 'volume', 'chapter', 'section'));
ALTER TABLE work_sections DROP CONSTRAINT IF EXISTS work_sections_level_check;
ALTER TABLE work_sections ADD CONSTRAINT work_sections_level_check CHECK (level BETWEEN 1 AND 4);
ALTER TABLE work_sections DROP CONSTRAINT IF EXISTS work_sections_range_check;
ALTER TABLE work_sections ADD CONSTRAINT work_sections_range_check
  CHECK (end_sequence IS NULL OR end_sequence >= sequence);

CREATE INDEX IF NOT EXISTS work_sections_navigation_idx
  ON work_sections (work_id, sequence, level);
