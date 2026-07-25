ALTER TABLE translations ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'ai';
ALTER TABLE translations ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE translations ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE translations ADD COLUMN IF NOT EXISTS license_note text;
ALTER TABLE translations ADD COLUMN IF NOT EXISTS quality_report jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE translations DROP CONSTRAINT IF EXISTS translations_origin_check;
ALTER TABLE translations ADD CONSTRAINT translations_origin_check
  CHECK (origin IN ('ai', 'licensed', 'manual'));

CREATE TABLE IF NOT EXISTS translation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'zh-Hans',
  origin text NOT NULL DEFAULT 'ai' CHECK (origin IN ('ai', 'licensed', 'manual')),
  model text,
  prompt_version text,
  status import_job_status NOT NULL DEFAULT 'running',
  requested_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS translations_published_passage_idx
  ON translations (passage_id, language) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS translation_jobs_work_idx
  ON translation_jobs (work_id, started_at DESC);
