CREATE TABLE IF NOT EXISTS token_approvals (id text PRIMARY KEY, owner text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS approvals_owner_created ON token_approvals(owner, created_at DESC);
CREATE TABLE IF NOT EXISTS execution_holds (wallet text PRIMARY KEY, reason text NOT NULL, transaction_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
