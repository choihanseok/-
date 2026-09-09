CREATE TABLE roles (
  role_code VARCHAR(32) PRIMARY KEY
);
INSERT INTO roles(role_code) VALUES
('CUSTOMER'),('PROVIDER'),('MERCHANT'),('SERVICE_ADMIN'),('DISTRIBUTOR'),('PLATFORM_ADMIN'),('SUPER_ADMIN');

CREATE TABLE account_roles (
  account_id VARCHAR(36) NOT NULL,
  role_code VARCHAR(32) NOT NULL,
  service_id VARCHAR(64) NULL,
  merchant_id VARCHAR(64) NULL,
  distributor_id VARCHAR(64) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  granted_at TIMESTAMP NOT NULL,
  granted_by VARCHAR(36) NULL,
  FOREIGN KEY(role_code) REFERENCES roles(role_code)
);
CREATE INDEX idx_account_roles_account ON account_roles(account_id, status);

CREATE TABLE role_permissions (
  role_code VARCHAR(32) NOT NULL,
  permission_code VARCHAR(128) NOT NULL,
  action VARCHAR(32) NOT NULL,
  scope VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  FOREIGN KEY(role_code) REFERENCES roles(role_code),
  UNIQUE(role_code, permission_code, action, scope)
);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_code, status);
