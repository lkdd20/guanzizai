CREATE TABLE IF NOT EXISTS glossary_terms (
  id bigserial PRIMARY KEY,
  canonical_key text NOT NULL UNIQUE,
  term_traditional text NOT NULL,
  term_simplified text NOT NULL,
  pinyin text,
  sanskrit_or_other_form text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_term_definitions (
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

CREATE TABLE IF NOT EXISTS term_mentions (
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

CREATE INDEX IF NOT EXISTS work_term_definitions_work_idx
  ON work_term_definitions (work_id, review_status);
CREATE INDEX IF NOT EXISTS term_mentions_passage_idx
  ON term_mentions (passage_id, displayable);
CREATE INDEX IF NOT EXISTS term_mentions_definition_idx
  ON term_mentions (definition_id);
