-- Apply once to an existing D1 database whose sutras table already has library.
ALTER TABLE sutras ADD COLUMN source_verification TEXT DEFAULT 'verified';
ALTER TABLE sutras ADD COLUMN source_batch TEXT;
