export class ServiceRepository {
  async findById(_serviceId) { throw new Error('NOT_IMPLEMENTED'); }
  async findByCode(_serviceCode) { throw new Error('NOT_IMPLEMENTED'); }
  async list(_filter = {}) { throw new Error('NOT_IMPLEMENTED'); }
  async save(_service) { throw new Error('NOT_IMPLEMENTED'); }
  async saveConfig(_serviceId, _key, _value, _updatedAt = new Date()) { throw new Error('NOT_IMPLEMENTED'); }
  async getConfig(_serviceId, _key) { throw new Error('NOT_IMPLEMENTED'); }
}

export class InMemoryServiceRepository extends ServiceRepository {
  #byId = new Map();
  #idByCode = new Map();
  #configs = new Map();

  async findById(serviceId) { return this.#byId.get(serviceId) ?? null; }

  async findByCode(serviceCode) {
    const serviceId = this.#idByCode.get(serviceCode);
    return serviceId ? this.#byId.get(serviceId) ?? null : null;
  }

  async list({ status, serviceType } = {}) {
    return [...this.#byId.values()].filter((service) =>
      (!status || service.status === status) && (!serviceType || service.serviceType === serviceType));
  }

  async save(service) {
    const existingId = this.#idByCode.get(service.serviceCode);
    if (existingId && existingId !== service.serviceId) throw new Error('SERVICE_CODE_ALREADY_EXISTS');
    const previous = this.#byId.get(service.serviceId);
    if (previous && previous.serviceCode !== service.serviceCode) this.#idByCode.delete(previous.serviceCode);
    this.#byId.set(service.serviceId, service);
    this.#idByCode.set(service.serviceCode, service.serviceId);
    return service;
  }

  async saveConfig(serviceId, key, value, updatedAt = new Date()) {
    if (!this.#byId.has(serviceId)) throw new Error('SERVICE_NOT_FOUND');
    const configKey = `${serviceId}:${key}`;
    this.#configs.set(configKey, { serviceId, key, value: structuredClone(value), status: 'ACTIVE', updatedAt });
    return this.#configs.get(configKey);
  }

  async getConfig(serviceId, key) {
    const item = this.#configs.get(`${serviceId}:${key}`);
    return item ? structuredClone(item.value) : null;
  }
}
