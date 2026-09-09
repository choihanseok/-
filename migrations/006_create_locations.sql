CREATE TABLE locations (
  location_id VARCHAR(64) PRIMARY KEY,
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('CURRENT','ORIGIN','DESTINATION','WAYPOINT','BUSINESS')),
  latitude DOUBLE NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude DOUBLE NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  address VARCHAR(500) NULL,
  road_address VARCHAR(500) NULL,
  label VARCHAR(255) NULL,
  owner_account_id VARCHAR(64) NULL,
  service_id VARCHAR(64) NULL,
  reference_type VARCHAR(64) NULL,
  reference_id VARCHAR(64) NULL,
  sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  metadata_json TEXT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_locations_owner ON locations(owner_account_id, purpose);
CREATE INDEX idx_locations_service ON locations(service_id, purpose);
CREATE INDEX idx_locations_reference ON locations(reference_type, reference_id, sequence);
