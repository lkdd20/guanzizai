CREATE TABLE IF NOT EXISTS support_intents (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  provider text NOT NULL,
  user_email text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  surname text,
  nickname text NOT NULL,
  message text,
  public_credit boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_intents_user_submitted_idx
  ON support_intents (user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS support_intents_status_submitted_idx
  ON support_intents (status, submitted_at DESC);
