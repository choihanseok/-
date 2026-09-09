CREATE TABLE orders (
  order_id VARCHAR(36) PRIMARY KEY,
  service_id VARCHAR(64) NOT NULL,
  service_code VARCHAR(64) NOT NULL,
  customer_account_id VARCHAR(36) NOT NULL,
  provider_account_id VARCHAR(36) NULL,
  merchant_id VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL,
  scheduled_at TIMESTAMP NULL,
  requested_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  CHECK(status IN ('DRAFT','REQUESTED','RECEIVED','SEARCHING','ASSIGNED','ACCEPTED','IN_PROGRESS','COMPLETED','CANCEL_REQUESTED','CANCELLED','FAILED'))
);

CREATE INDEX idx_orders_service_status ON orders(service_id, status);
CREATE INDEX idx_orders_customer ON orders(customer_account_id, created_at);
CREATE INDEX idx_orders_provider ON orders(provider_account_id, status);
CREATE INDEX idx_orders_merchant ON orders(merchant_id, status);

CREATE TABLE order_status_histories (
  history_id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  actor_account_id VARCHAR(36) NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(order_id),
  CHECK(from_status IS NULL OR from_status IN ('DRAFT','REQUESTED','RECEIVED','SEARCHING','ASSIGNED','ACCEPTED','IN_PROGRESS','COMPLETED','CANCEL_REQUESTED','CANCELLED','FAILED')),
  CHECK(to_status IN ('DRAFT','REQUESTED','RECEIVED','SEARCHING','ASSIGNED','ACCEPTED','IN_PROGRESS','COMPLETED','CANCEL_REQUESTED','CANCELLED','FAILED'))
);

CREATE INDEX idx_order_status_history_order ON order_status_histories(order_id, created_at);
