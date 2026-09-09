import { Location } from './location.js';
import { LocationRepository } from './location-repository.js';

export class SqliteLocationRepository extends LocationRepository {
  constructor({ database }) {
    super();
    if (!database) throw new TypeError('LOCATION_DATABASE_REQUIRED');
    this.database = database;
  }

  async findById(locationId) {
    const row = this.database.prepare(`
      SELECT location_id, purpose, latitude, longitude, address, road_address, label,
             owner_account_id, service_id, reference_type, reference_id, sequence,
             metadata_json, created_at, updated_at
      FROM locations
      WHERE location_id = ?
    `).get(locationId);
    return row ? this.#toEntity(row) : null;
  }

  async list({ ownerAccountId = null, serviceId = null, referenceType = null, referenceId = null, purpose = null } = {}) {
    const rows = this.database.prepare(`
      SELECT location_id, purpose, latitude, longitude, address, road_address, label,
             owner_account_id, service_id, reference_type, reference_id, sequence,
             metadata_json, created_at, updated_at
      FROM locations
      WHERE (? IS NULL OR owner_account_id = ?)
        AND (? IS NULL OR service_id = ?)
        AND (? IS NULL OR reference_type = ?)
        AND (? IS NULL OR reference_id = ?)
        AND (? IS NULL OR purpose = ?)
      ORDER BY sequence ASC, created_at ASC
    `).all(
      ownerAccountId, ownerAccountId,
      serviceId, serviceId,
      referenceType, referenceType,
      referenceId, referenceId,
      purpose, purpose,
    );
    return rows.map((row) => this.#toEntity(row));
  }

  async save(location) {
    this.database.prepare(`
      INSERT INTO locations (
        location_id, purpose, latitude, longitude, address, road_address, label,
        owner_account_id, service_id, reference_type, reference_id, sequence,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(location_id) DO UPDATE SET
        purpose = excluded.purpose,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        address = excluded.address,
        road_address = excluded.road_address,
        label = excluded.label,
        owner_account_id = excluded.owner_account_id,
        service_id = excluded.service_id,
        reference_type = excluded.reference_type,
        reference_id = excluded.reference_id,
        sequence = excluded.sequence,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      location.locationId,
      location.purpose,
      location.latitude,
      location.longitude,
      location.address,
      location.roadAddress,
      location.label,
      location.ownerAccountId,
      location.serviceId,
      location.referenceType,
      location.referenceId,
      location.sequence,
      JSON.stringify(location.metadata ?? {}),
      location.createdAt.toISOString(),
      location.updatedAt.toISOString(),
    );
    return this.findById(location.locationId);
  }

  #toEntity(row) {
    return new Location({
      locationId: row.location_id,
      purpose: row.purpose,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      roadAddress: row.road_address,
      label: row.label,
      ownerAccountId: row.owner_account_id,
      serviceId: row.service_id,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      sequence: row.sequence,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
