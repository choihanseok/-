import { Service } from './service.js';
import { ServiceRepository } from './service-repository.js';

function parseJson(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  return JSON.parse(value);
}

export class SqliteServiceRepository extends ServiceRepository {
  constructor({ database }) {
    super();
    if (!database) throw new TypeError('SERVICE_DATABASE_REQUIRED');
    this.database = database;
  }

  async findById(serviceId) {
    const row = this.database.prepare(`
      SELECT service_id, service_code, service_name, service_type, status,
             category, description, configuration_json, created_at, updated_at
      FROM services WHERE service_id = ?
    `).get(serviceId);
    return row ? this.#toEntity(row) : null;
  }

  async findByCode(serviceCode) {
    const row = this.database.prepare(`
      SELECT service_id, service_code, service_name, service_type, status,
             category, description, configuration_json, created_at, updated_at
      FROM services WHERE service_code = ?
    `).get(serviceCode);
    return row ? this.#toEntity(row) : null;
  }

  async list({ status, serviceType } = {}) {
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (serviceType) { clauses.push('service_type = ?'); params.push(serviceType); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.database.prepare(`
      SELECT service_id, service_code, service_name, service_type, status,
             category, description, configuration_json, created_at, updated_at
      FROM services ${where}
      ORDER BY service_code
    `).all(...params).map((row) => this.#toEntity(row));
  }

  async save(service) {
    const duplicate = this.database.prepare(`
      SELECT service_id FROM services WHERE service_code = ? AND service_id <> ?
    `).get(service.serviceCode, service.serviceId);
    if (duplicate) throw new Error('SERVICE_CODE_ALREADY_EXISTS');

    this.database.prepare(`
      INSERT INTO services (
        service_id, service_code, service_name, service_type, status,
        category, description, configuration_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(service_id) DO UPDATE SET
        service_code = excluded.service_code,
        service_name = excluded.service_name,
        service_type = excluded.service_type,
        status = excluded.status,
        category = excluded.category,
        description = excluded.description,
        configuration_json = excluded.configuration_json,
        updated_at = excluded.updated_at
    `).run(
      service.serviceId,
      service.serviceCode,
      service.serviceName,
      service.serviceType,
      service.status,
      service.category,
      service.description,
      JSON.stringify(service.configuration ?? {}),
      service.createdAt.toISOString(),
      service.updatedAt.toISOString(),
    );
    return this.findById(service.serviceId);
  }

  async saveConfig(serviceId, key, value, updatedAt = new Date()) {
    if (!key) throw new TypeError('SERVICE_CONFIG_KEY_REQUIRED');
    if (!(await this.findById(serviceId))) throw new Error('SERVICE_NOT_FOUND');
    const configId = `${serviceId}:${key}`;
    this.database.prepare(`
      INSERT INTO service_configs (
        service_config_id, service_id, config_key, config_value_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
      ON CONFLICT(service_id, config_key) DO UPDATE SET
        config_value_json = excluded.config_value_json,
        status = 'ACTIVE',
        updated_at = excluded.updated_at
    `).run(configId, serviceId, key, JSON.stringify(value), updatedAt.toISOString(), updatedAt.toISOString());
    return { serviceId, key, value: structuredClone(value), status: 'ACTIVE', updatedAt };
  }

  async getConfig(serviceId, key) {
    const row = this.database.prepare(`
      SELECT config_value_json FROM service_configs
      WHERE service_id = ? AND config_key = ? AND status = 'ACTIVE'
    `).get(serviceId, key);
    return row ? parseJson(row.config_value_json, null) : null;
  }

  #toEntity(row) {
    return new Service({
      serviceId: row.service_id,
      serviceCode: row.service_code,
      serviceName: row.service_name,
      serviceType: row.service_type,
      status: row.status,
      category: row.category,
      description: row.description,
      configuration: parseJson(row.configuration_json, {}),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
