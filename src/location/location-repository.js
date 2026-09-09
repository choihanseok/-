export class LocationRepository {
  async findById(_locationId) { throw new Error('NOT_IMPLEMENTED'); }
  async list(_filter = {}) { throw new Error('NOT_IMPLEMENTED'); }
  async save(_location) { throw new Error('NOT_IMPLEMENTED'); }
}

export class InMemoryLocationRepository extends LocationRepository {
  #byId = new Map();

  async findById(locationId) {
    return this.#byId.get(locationId) ?? null;
  }

  async list({ ownerAccountId = null, serviceId = null, referenceType = null, referenceId = null, purpose = null } = {}) {
    return [...this.#byId.values()].filter((location) =>
      (ownerAccountId == null || location.ownerAccountId === ownerAccountId) &&
      (serviceId == null || location.serviceId === serviceId) &&
      (referenceType == null || location.referenceType === referenceType) &&
      (referenceId == null || location.referenceId === referenceId) &&
      (purpose == null || location.purpose === purpose)
    );
  }

  async save(location) {
    this.#byId.set(location.locationId, location);
    return location;
  }
}
