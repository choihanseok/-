-- ZERO CALL Common Matching Foundation reference migration.
-- Production DBMS/ORM remain NEED_REVIEW.

CREATE TABLE IF NOT EXISTS matchings (
  matching_id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  service_id VARCHAR(36) NOT NULL,
  provider_account_id VARCHAR(36),
  merchant_id VARCHAR(36),
  mode VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  attempt_no INTEGER NOT NULL,
  reason TEXT,
  matched_at TEXT,
  responded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (mode IN ('AUTO','MERCHANT','MANUAL_ADMIN','EXTERNAL')),
  CHECK (status IN ('REQUESTED','OFFERED','ACCEPTED','REJECTED','REASSIGNED','CANCELLED','FAILED')),
  CHECK (attempt_no >= 1),
  UNIQUE(order_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_matchings_order_id ON matchings(order_id);
CREATE INDEX IF NOT EXISTS idx_matchings_service_status ON matchings(service_id, status);
CREATE INDEX IF NOT EXISTS idx_matchings_provider_status ON matchings(provider_account_id, status);
