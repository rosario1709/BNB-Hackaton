CREATE TABLE IF NOT EXISTS intents (id text PRIMARY KEY, owner text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS representations (id text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS route_evaluations (id text PRIMARY KEY, intent_id text NOT NULL REFERENCES intents(id), payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS execution_receipts (id text PRIMARY KEY, owner text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS receipts_owner_created ON execution_receipts(owner, created_at DESC);
CREATE TABLE IF NOT EXISTS executions (id text PRIMARY KEY, owner text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS api_telemetry (id text PRIMARY KEY, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
