ALTER TABLE executions ADD COLUMN IF NOT EXISTS transaction_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS executions_transaction_hash ON executions (transaction_hash) WHERE transaction_hash IS NOT NULL;
