-- ZC-TASK-20260909-003
-- ZERO CALL Authentication Foundation reference migration.
-- Production DBMS remains NEED_REVIEW.

CREATE TABLE auth_challenges (
  challenge_id VARCHAR(36) PRIMARY KEY,
  phone VARCHAR(32) NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMP NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_auth_challenge_status CHECK (status IN ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED')),
  CONSTRAINT ck_auth_attempt_count CHECK (attempt_count >= 0)
);

CREATE INDEX idx_auth_challenges_phone ON auth_challenges(phone);
CREATE INDEX idx_auth_challenges_status_expires ON auth_challenges(status, expires_at);
