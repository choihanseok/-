import { randomUUID } from 'node:crypto';
import { PermissionAction } from '../authorization/permission-action.js';
import { Location, distanceMeters } from './location.js';

export const LocationPermission = Object.freeze({
  VIEW: 'LOCATION.VIEW',
  CREATE: 'LOCATION.CREATE',
  UPDATE: 'LOCATION.UPDATE',
  ROUTE: 'LOCATION.ROUTE',
  SEARCH: 'LOCATION.SEARCH',
});

export class LocationService {
  constructor({ locationRepository, authorizationService = null, mapProvider = null, idGenerator = randomUUID, clock = () => new Date() }) {
    if (!locationRepository) throw new TypeError('LOCATION_REPOSITORY_REQUIRED');
    this.locationRepository = locationRepository;
    this.authorizationService = authorizationService;
    this.mapProvider = mapProvider;
    this.idGenerator = idGenerator;
    this.clock = clock;
  }

  async #require(actorAccountId, permissionCode, action, resource = {}) {
    if (!this.authorizationService) return null;
    if (!actorAccountId) throw new TypeError('ACTOR_ACCOUNT_ID_REQUIRED');
    return this.authorizationService.requirePermission({ accountId: actorAccountId, permissionCode, action, resource });
  }

  async createLocation({ actorAccountId = null, ...input }) {
    await this.#require(actorAccountId, LocationPermission.CREATE, PermissionAction.CREATE, {
      ownerAccountId: input.ownerAccountId,
      serviceId: input.serviceId,
    });
    const now = this.clock();
    return this.locationRepository.save(new Location({
      ...input,
      locationId: input.locationId ?? this.idGenerator(),
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    }));
  }

  async getLocation(locationId, { actorAccountId = null } = {}) {
    const location = await this.locationRepository.findById(locationId);
    if (!location) throw new Error('LOCATION_NOT_FOUND');
    await this.#require(actorAccountId, LocationPermission.VIEW, PermissionAction.VIEW, {
      ownerAccountId: location.ownerAccountId,
      serviceId: location.serviceId,
    });
    return location;
  }

  async listLocations(filter = {}, { actorAccountId = null } = {}) {
    const rows = await this.locationRepository.list(filter);
    if (!this.authorizationService) return rows;
    const allowed = [];
    for (const location of rows) {
      const result = await this.authorizationService.authorize({
        accountId: actorAccountId,
        permissionCode: LocationPermission.VIEW,
        action: PermissionAction.VIEW,
        resource: { ownerAccountId: location.ownerAccountId, serviceId: location.serviceId },
      });
      if (result.allowed) allowed.push(location);
    }
    return allowed;
  }

  async updatePosition(locationId, position, { actorAccountId = null } = {}) {
    const location = await this.locationRepository.findById(locationId);
    if (!location) throw new Error('LOCATION_NOT_FOUND');
    await this.#require(actorAccountId, LocationPermission.UPDATE, PermissionAction.UPDATE, {
      ownerAccountId: location.ownerAccountId,
      serviceId: location.serviceId,
    });
    return this.locationRepository.save(location.withPosition({ ...position, updatedAt: this.clock() }));
  }

  calculateStraightDistance(origin, destination) {
    return distanceMeters(origin, destination);
  }

  async geocode(query, { actorAccountId = null, serviceId = null } = {}) {
    if (!this.mapProvider) throw new Error('MAP_PROVIDER_NOT_CONFIGURED');
    await this.#require(actorAccountId, LocationPermission.SEARCH, PermissionAction.VIEW, { serviceId });
    return this.mapProvider.geocode(query);
  }

  async reverseGeocode(coordinate, { actorAccountId = null, serviceId = null } = {}) {
    if (!this.mapProvider) throw new Error('MAP_PROVIDER_NOT_CONFIGURED');
    await this.#require(actorAccountId, LocationPermission.SEARCH, PermissionAction.VIEW, { serviceId });
    return this.mapProvider.reverseGeocode(coordinate);
  }

  async calculateRoute({ origin, destination, waypoints = [], serviceId = null }, { actorAccountId = null } = {}) {
    if (!this.mapProvider) throw new Error('MAP_PROVIDER_NOT_CONFIGURED');
    await this.#require(actorAccountId, LocationPermission.ROUTE, PermissionAction.VIEW, { serviceId });
    return this.mapProvider.calculateRoute({ origin, destination, waypoints, serviceId });
  }

  async searchNearby({ center, radiusMeters, category = null, serviceId = null }, { actorAccountId = null } = {}) {
    if (!this.mapProvider) throw new Error('MAP_PROVIDER_NOT_CONFIGURED');
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) throw new TypeError('LOCATION_RADIUS_INVALID');
    await this.#require(actorAccountId, LocationPermission.SEARCH, PermissionAction.VIEW, { serviceId });
    return this.mapProvider.searchNearby({ center, radiusMeters, category, serviceId });
  }
}
