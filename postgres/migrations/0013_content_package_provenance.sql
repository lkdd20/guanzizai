ALTER TABLE source_batches ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE source_batches ADD COLUMN IF NOT EXISTS attribution_text text;
ALTER TABLE source_batches ADD COLUMN IF NOT EXISTS license_text text;

CREATE TABLE IF NOT EXISTS content_records (
  id text PRIMARY KEY,
  work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  section_id bigint NOT NULL UNIQUE REFERENCES work_sections(id) ON DELETE CASCADE,
  source_batch text NOT NULL REFERENCES source_batches(id) ON DELETE RESTRICT,
  local_index integer NOT NULL CHECK (local_index > 0),
  global_index integer NOT NULL CHECK (global_index > 0),
  title_traditional text NOT NULL,
  title_simplified text NOT NULL,
  title_pinyin text NOT NULL DEFAULT '',
  title_is_original boolean NOT NULL DEFAULT true,
  hierarchy_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_traditional text NOT NULL,
  original_simplified text NOT NULL,
  original_simplified_pinyin text NOT NULL DEFAULT '',
  project_punctuated_traditional text,
  source_han_character_count bigint NOT NULL CHECK (source_han_character_count >= 0),
  original_hash char(64) NOT NULL,
  source_snapshot_hash char(64) NOT NULL,
  summary text NOT NULL DEFAULT '',
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  reading_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  allusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  textual_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  cross_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  rights jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  publication_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  package_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, local_index)
);

CREATE TABLE IF NOT EXISTS content_sources (
  id bigserial PRIMARY KEY,
  record_id text NOT NULL REFERENCES content_records(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  component_index integer NOT NULL CHECK (component_index >= 0),
  role text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'cross_check')),
  platform text NOT NULL,
  institution text,
  source_tier text,
  page_title text NOT NULL,
  page_id bigint,
  revision_id text NOT NULL,
  parent_revision_id text,
  revision_timestamp timestamptz,
  revision_sha1 text,
  persistent_identifier text,
  url text NOT NULL,
  edition text,
  retrieved_at date,
  license text NOT NULL,
  license_url text,
  normalized_text_hash char(64),
  normalized_han_character_count bigint CHECK (normalized_han_character_count IS NULL OR normalized_han_character_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, source_id, component_index)
);

CREATE TABLE IF NOT EXISTS replacement_candidates (
  source_batch text NOT NULL REFERENCES source_batches(id) ON DELETE CASCADE,
  replacement_key text NOT NULL,
  new_record_id text NOT NULL REFERENCES content_records(id) ON DELETE CASCADE,
  old_record_id text,
  new_source_hash char(64) NOT NULL,
  old_source_hash char(64),
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_batch, replacement_key)
);

CREATE INDEX IF NOT EXISTS content_records_work_index_idx ON content_records (work_id, local_index);
CREATE INDEX IF NOT EXISTS content_records_batch_idx ON content_records (source_batch);
CREATE INDEX IF NOT EXISTS content_sources_record_idx ON content_sources (record_id, component_index);
CREATE INDEX IF NOT EXISTS content_sources_revision_idx ON content_sources (platform, revision_id);
