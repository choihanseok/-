-- ZC-TASK-20260909-001
-- ZERO CALL Account Foundation reference migration.
-- DBMS is still NEED_REVIEW. Verify/adapt types before production execution.

CREATE TABLE accounts (
  account_id VARCHAR(36) PRIMARY KEY,
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(320) NULL,
  name VARCHAR(120) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_accounts_phone UNIQUE (phone),
  CONSTRAINT ck_accounts_status CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'WITHDRAWN'))
);

CREATE INDEX idx_accounts_status ON accounts(status);
