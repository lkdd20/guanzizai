UPDATE user_highlights
SET color = 'gold'
WHERE color = 'cinnabar';

ALTER TABLE user_highlights
  ALTER COLUMN color SET DEFAULT 'gold';
