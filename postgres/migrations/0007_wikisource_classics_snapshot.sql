CREATE TABLE IF NOT EXISTS passage_enrichments (
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

CREATE TABLE IF NOT EXISTS translation_draft_segments (
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

CREATE INDEX IF NOT EXISTS passage_enrichments_source_record_idx
  ON passage_enrichments (source_record_id);

CREATE INDEX IF NOT EXISTS translation_draft_segments_passage_idx
  ON translation_draft_segments (passage_id, segment_index);
