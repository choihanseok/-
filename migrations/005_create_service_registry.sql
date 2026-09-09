-- ZC-TASK-20260909-006
-- ZERO CALL Service Registry reference migration.
-- Production DBMS/ORM remain NEED_REVIEW.

CREATE TABLE services (
  service_id VARCHAR(36) PRIMARY KEY,
  service_code VARCHAR(64) NOT NULL,
  service_name VARCHAR(160) NOT NULL,
  service_type VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  category VARCHAR(120) NULL,
  description TEXT NULL,
  configuration_json TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_services_code UNIQUE (service_code),
  CONSTRAINT ck_services_type CHECK (service_type IN ('MBS','EST','RNT','BUY','AUC','MTC','INF','AGC')),
  CONSTRAINT ck_services_status CHECK (status IN ('DRAFT','ACTIVE','SUSPENDED','INACTIVE'))
);

CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_type ON services(service_type);

CREATE TABLE service_configs (
  service_config_id VARCHAR(160) PRIMARY KEY,
  service_id VARCHAR(36) NOT NULL,
  config_key VARCHAR(120) NOT NULL,
  config_value_json TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_service_configs UNIQUE (service_id, config_key),
  CONSTRAINT fk_service_configs_service FOREIGN KEY (service_id) REFERENCES services(service_id)
);

CREATE INDEX idx_service_configs_service ON service_configs(service_id);
