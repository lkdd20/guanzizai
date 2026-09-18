CREATE TYPE source_verification_status AS ENUM ('unverified', 'reviewing', 'verified', 'rejected');
CREATE TYPE publication_status AS ENUM ('hidden', 'catalog_only', 'published');
CREATE TYPE import_job_status AS ENUM ('running', 'completed', 'failed', 'rolled_back');
CREATE TYPE translation_status AS ENUM ('draft', 'reviewed', 'published');

CREATE TABLE source_batches (
  id text PRIMARY KEY,
  source_name text NOT NULL,
  source_repository text,
  source_commit text,
  manifest_hash text NOT NULL,
  rights_note text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  attribution_text text,
  license_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz
);

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_batch text NOT NULL REFERENCES source_batches(id) ON DELETE CASCADE,
  status import_job_status NOT NULL DEFAULT 'running',
  requested_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE works (
  id text PRIMARY KEY,
  library text NOT NULL CHECK (length(trim(library)) > 0),
  source_batch text NOT NULL REFERENCES source_batches(id) ON DELETE RESTRICT,
  source_verification source_verification_status NOT NULL DEFAULT 'unverified',
  publication_status publication_status NOT NULL DEFAULT 'hidden',
  source_edition text NOT NULL,
  source_path text NOT NULL,
  title text NOT NULL,
  author text,
  dynasty text,
  category text,
  content_hash char(64) NOT NULL,
  content_revision text NOT NULL DEFAULT gen_random_uuid()::text,
  character_count bigint NOT NULL CHECK (character_count >= 0),
  passage_count integer NOT NULL DEFAULT 0 CHECK (passage_count >= 0),
  content_object_key text,
  content_encoding text,
  content_bytes bigint CHECK (content_bytes IS NULL OR content_bytes >= 0),
  content_object_hash char(64),
  reading_start_sequence integer NOT NULL DEFAULT 0 CHECK (reading_start_sequence >= 0),
  imported_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (source_batch, source_path),
  CHECK ((publication_status = 'published') = (published_at IS NOT NULL))
);

CREATE TABLE work_sections (
  id bigserial PRIMARY KEY,
  work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  title text,
  juan integer,
  sequence integer NOT NULL,
  kind text NOT NULL DEFAULT 'body' CHECK (kind IN ('body', 'volume', 'chapter', 'section')),
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 4),
  parent_section_key text,
  end_sequence integer,
  content_hash char(64) NOT NULL,
  character_count bigint NOT NULL CHECK (character_count >= 0),
  UNIQUE (work_id, section_key),
  CHECK (end_sequence IS NULL OR end_sequence >= sequence)
);

CREATE TABLE passages (
  id text PRIMARY KEY,
  work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  section_id bigint NOT NULL REFERENCES work_sections(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  original_text text NOT NULL,
  content_hash char(64) NOT NULL,
  character_count integer NOT NULL CHECK (character_count >= 0),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, sequence)
);

CREATE TABLE translations (
  id bigserial PRIMARY KEY,
  passage_id text NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
  language text NOT NULL,
  content text NOT NULL,
  content_hash char(64) NOT NULL,
  source_content_hash char(64) NOT NULL,
  model text,
  prompt_version text,
  origin text NOT NULL DEFAULT 'ai' CHECK (origin IN ('ai', 'licensed', 'manual')),
  source_name text,
  source_url text,
  license_note text,
  quality_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  contributor_name text,
  contribution_id uuid,
  status translation_status NOT NULL DEFAULT 'draft',
  reviewer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (passage_id, language)
);

CREATE TABLE passage_enrichments (
  passage_id text PRIMARY KEY REFERENCES passages(id) ON DELETE CASCADE,
  source_record_id text NOT NULL UNIQUE,
  title_traditional text NOT NULL,
  title_simplified text NOT NULL,
  title_is_original boolean NOT NULL,
  original_traditional text NOT NULL,
  original_simplified text NOT NULL,
  original_simplified_pinyin text NOT NULL,
  pinyin_status text NOT NULL,
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  reading_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_url text NOT NULL,
  source_revision_id text NOT NULL,
  source_license text NOT NULL,
  source_record_hash char(64) NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content_records (
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

CREATE TABLE glossary_terms (
  id bigserial PRIMARY KEY,
  canonical_key text NOT NULL UNIQUE,
  term_traditional text NOT NULL,
  term_simplified text NOT NULL,
  pinyin text,
  sanskrit_or_other_form text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE work_term_definitions (
  id bigserial PRIMARY KEY,
  work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  term_id bigint NOT NULL REFERENCES glossary_terms(id) ON DELETE RESTRICT,
  explanation text NOT NULL,
  category text,
  source_label text,
  confidence text,
  review_status text NOT NULL DEFAULT 'machine_draft'
    CHECK (review_status IN ('machine_draft', 'reviewing', 'reviewed', 'rejected')),
  source_note_count integer NOT NULL DEFAULT 1 CHECK (source_note_count > 0),
  source_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_propagation_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, term_id)
);

CREATE TABLE term_mentions (
  id bigserial PRIMARY KEY,
  definition_id bigint NOT NULL REFERENCES work_term_definitions(id) ON DELETE CASCADE,
  passage_id text NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
  start_offset integer NOT NULL CHECK (start_offset >= 0),
  end_offset integer NOT NULL CHECK (end_offset > start_offset),
  matched_text text NOT NULL,
  source_method text NOT NULL CHECK (source_method IN ('source_binding', 'exact_match')),
  displayable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (definition_id, passage_id, start_offset, end_offset)
);

CREATE TABLE content_sources (
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

CREATE TABLE replacement_candidates (
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

CREATE TABLE translation_draft_segments (
  id bigserial PRIMARY KEY,
  passage_id text NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
  segment_index integer NOT NULL CHECK (segment_index >= 0),
  source_text text NOT NULL,
  translation_text text NOT NULL,
  method text,
  model text,
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  human_reviewed boolean NOT NULL DEFAULT false,
  source_snapshot_hash char(64) NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (passage_id, segment_index)
);

CREATE TABLE translation_contributions (
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

ALTER TABLE translations ADD CONSTRAINT translations_contribution_id_fkey
  FOREIGN KEY (contribution_id) REFERENCES translation_contributions(id) ON DELETE SET NULL;

CREATE TABLE translation_jobs (
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

CREATE TABLE community_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('source_text', 'translation_resource', 'correction', 'authorization', 'institution', 'bug_report')),
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
  attachment_key text,
  attachment_name text,
  attachment_content_type text,
  attachment_bytes bigint,
  attachment_sha256 char(64),
  attachment_status text NOT NULL DEFAULT 'none' CHECK (attachment_status IN ('none', 'uploaded', 'deleted')),
  attachment_uploaded_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'needs_changes', 'accepted', 'rejected')),
  reviewer text,
  review_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK ((attachment_status = 'none' AND attachment_key IS NULL)
    OR (attachment_status IN ('uploaded', 'deleted') AND attachment_key IS NOT NULL))
);

CREATE TABLE verification_records (
  id bigserial PRIMARY KEY,
  work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  from_status source_verification_status NOT NULL,
  to_status source_verification_status NOT NULL,
  reviewer text NOT NULL,
  note text,
  checked_passage_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_url text,
  profile_bio text,
  public_slug text,
  profile_public boolean NOT NULL DEFAULT false,
  show_bio boolean NOT NULL DEFAULT false,
  show_contributions boolean NOT NULL DEFAULT false,
  show_reading_milestones boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_identities (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('github', 'google', 'email')),
  provider_subject text NOT NULL,
  provider_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE TABLE reading_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id text NOT NULL,
  content_version text NOT NULL,
  passage_id text NOT NULL,
  passage_sequence integer NOT NULL CHECK (passage_sequence > 0),
  intra_passage_ratio real NOT NULL DEFAULT 0 CHECK (intra_passage_ratio BETWEEN 0 AND 1),
  reader_mode text NOT NULL CHECK (reader_mode IN ('original', 'plain', 'parallel')),
  writing_direction text NOT NULL DEFAULT 'horizontal' CHECK (writing_direction IN ('horizontal', 'vertical')),
  device_id text NOT NULL,
  total_passages integer NOT NULL DEFAULT 1 CHECK (total_passages > 0),
  progress_ratio real NOT NULL DEFAULT 0 CHECK (progress_ratio BETWEEN 0 AND 1),
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_id)
);

CREATE TABLE user_bookmarks (
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

CREATE TABLE user_highlights (
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
  color text NOT NULL DEFAULT 'gold' CHECK (color IN ('cinnabar', 'gold', 'ink')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reading_activity_daily (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id text NOT NULL,
  activity_date date NOT NULL DEFAULT current_date,
  active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  opened_count integer NOT NULL DEFAULT 0 CHECK (opened_count >= 0),
  max_progress_ratio real NOT NULL DEFAULT 0 CHECK (max_progress_ratio BETWEEN 0 AND 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_id, activity_date)
);

CREATE TABLE app_runtime_settings (
  setting_key text PRIMARY KEY,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text NOT NULL DEFAULT 'admin',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX works_public_catalog_idx ON works (library, category, title)
  WHERE publication_status IN ('catalog_only', 'published');
CREATE INDEX works_batch_idx ON works (source_batch);
CREATE INDEX passages_work_sequence_idx ON passages (work_id, sequence);
CREATE INDEX translations_published_passage_idx
  ON translations (passage_id, language) WHERE status = 'published';
CREATE INDEX passage_enrichments_source_record_idx ON passage_enrichments (source_record_id);
CREATE INDEX content_records_work_index_idx ON content_records (work_id, local_index);
CREATE INDEX content_records_batch_idx ON content_records (source_batch);
CREATE INDEX work_term_definitions_work_idx ON work_term_definitions (work_id, review_status);
CREATE INDEX term_mentions_passage_idx ON term_mentions (passage_id, displayable);
CREATE INDEX term_mentions_definition_idx ON term_mentions (definition_id);
CREATE INDEX content_sources_record_idx ON content_sources (record_id, component_index);
CREATE INDEX content_sources_revision_idx ON content_sources (platform, revision_id);
CREATE INDEX translation_draft_segments_passage_idx ON translation_draft_segments (passage_id, segment_index);
CREATE INDEX translation_jobs_work_idx ON translation_jobs (work_id, started_at DESC);
CREATE INDEX translation_contributions_status_idx ON translation_contributions (status, submitted_at);
CREATE INDEX translation_contributions_user_idx ON translation_contributions (contributor_user_id, submitted_at DESC);
CREATE INDEX community_contributions_status_idx ON community_contributions (status, submitted_at DESC);
CREATE INDEX community_contributions_user_idx ON community_contributions (contributor_user_id, submitted_at DESC);
CREATE INDEX community_contributions_email_idx ON community_contributions (contributor_email, submitted_at DESC);
CREATE INDEX community_contributions_attachment_idx ON community_contributions (attachment_status, submitted_at DESC);
CREATE INDEX user_identities_user_idx ON user_identities (user_id);
CREATE INDEX reading_progress_user_updated_idx ON reading_progress (user_id, updated_at DESC);
CREATE UNIQUE INDEX users_public_slug_unique_idx ON users (lower(public_slug)) WHERE public_slug IS NOT NULL;
CREATE INDEX user_bookmarks_user_created_idx ON user_bookmarks (user_id, created_at DESC);
CREATE INDEX user_highlights_user_created_idx ON user_highlights (user_id, created_at DESC);
CREATE INDEX user_highlights_work_idx ON user_highlights (user_id, work_id, passage_sequence);
CREATE INDEX reading_activity_user_date_idx ON reading_activity_daily (user_id, activity_date DESC);

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

CREATE TRIGGER work_sections_revision_trigger AFTER INSERT OR UPDATE OR DELETE ON work_sections
FOR EACH ROW EXECUTE FUNCTION bump_public_work_content_revision();
CREATE TRIGGER passages_revision_trigger AFTER INSERT OR UPDATE OR DELETE ON passages
FOR EACH ROW EXECUTE FUNCTION bump_public_work_content_revision();
CREATE TRIGGER translations_revision_trigger AFTER INSERT OR UPDATE OR DELETE ON translations
FOR EACH ROW EXECUTE FUNCTION bump_public_work_content_revision();
CREATE TRIGGER passage_enrichments_revision_trigger AFTER INSERT OR UPDATE OR DELETE ON passage_enrichments
FOR EACH ROW EXECUTE FUNCTION bump_public_work_content_revision();
