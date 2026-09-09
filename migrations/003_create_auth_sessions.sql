-- ZC-TASK-20260909-004
-- ZERO CALL Session/Login Foundation reference migration.
-- Production DBMS/ORM remain NEED_REVIEW.

CREATE TABLE auth_sessions (
  session_id VARCHAR(36) PRIMARY KEY,
  account_id VARCHAR(36) NOT NULL,
  access_token_hash VARCHAR(128) NOT NULL,
  refresh_token_hash VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  access_expires_at TIMESTAMP NOT NULL,
  refresh_expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  CONSTRAINT fk_auth_sessions_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
  CONSTRAINT uq_auth_sessions_access_hash UNIQUE (access_token_hash),
  CONSTRAINT uq_auth_sessions_refresh_hash UNIQUE (refresh_token_hash),
  CONSTRAINT ck_auth_sessions_status CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED'))
);

CREATE INDEX idx_auth_sessions_account_status ON auth_sessions(account_id, status);
CREATE INDEX idx_auth_sessions_refresh_expires ON auth_sessions(refresh_expires_at);
