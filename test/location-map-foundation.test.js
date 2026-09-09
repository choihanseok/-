import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AuthorizationService } from '../src/authorization/authorization-service.js';
import { PermissionAction } from '../src/authorization/permission-action.js';
import { PermissionScope } from '../src/authorization/permission-scope.js';
import { SqliteAuthorizationRepository } from '../src/authorization/sqlite-authorization-repository.js';
import { Location, distanceMeters } from '../src/location/location.js';
import { LocationPurpose } from '../src/location/location-purpose.js';
import { LocationPermission, LocationService } from '../src/location/location-service.js';
import { FakeMapProviderAdapter } from '../src/location/map-provider-adapter.js';
import { SqliteLocationRepository } from '../src/location/sqlite-location-repository.js';

const migration006 = readFileSync(new URL('../migrations/006_create_locations.sql', import.meta.url), 'utf8');
const migration004 = readFileSync(new URL('../migrations/004_create_authorization.sql', import.meta.url), 'utf8');

function createContext({ withAuthorization = false, mapProvider = null } = {}) {
  const database = new DatabaseSync(':memory:');
  database.exec(migration006);
  let authorizationService = null;
  if (withAuthorization) {
    database.exec(migration004);
    authorizationService = new AuthorizationService({
      authorizationRepository: new SqliteAuthorizationRepository({ database }),
      clock: () => new Date('2026-09-09T00:00:00.000Z'),
    });
  }
  const repository = new SqliteLocationRepository({ database });
  const service = new LocationService({
    locationRepository: repository,
    authorizationService,
    mapProvider,
    idGenerator: () => 'location-1',
    clock: () => new Date('2026-09-09T00:00:00.000Z'),
  });
  return { database, repository, service, authorizationService };
}

test('Location validates purpose and coordinate boundaries', () => {
  const location = new Location({ locationId: 'l1', purpose: LocationPurpose.ORIGIN, latitude: 37.5, longitude: 127.0 });
  assert.equal(location.purpose, 'ORIGIN');
  assert.throws(() => new Location({ locationId: 'l2', purpose: 'UNKNOWN', latitude: 0, longitude: 0 }), /LOCATION_PURPOSE_INVALID/);
  assert.throws(() => new Location({ locationId: 'l3', latitude: 91, longitude: 0 }), /LOCATION_LATITUDE_INVALID/);
  assert.throws(() => new Location({ locationId: 'l4', latitude: 0, longitude: 181 }), /LOCATION_LONGITUDE_INVALID/);
});

test('SQLite repository persists and filters location records', async (t) => {
  const { database, repository, service } = createContext();
  t.after(() => database.close());
  await service.createLocation({
    locationId: 'origin-1', purpose: 'ORIGIN', latitude: 37.5, longitude: 127.0,
    ownerAccountId: 'account-1', serviceId: 'service-driving', referenceType: 'ORDER', referenceId: 'order-1', sequence: 0,
    metadata: { source: 'manual' },
  });
  await service.createLocation({
    locationId: 'waypoint-1', purpose: 'WAYPOINT', latitude: 37.51, longitude: 127.01,
    ownerAccountId: 'account-1', serviceId: 'service-driving', referenceType: 'ORDER', referenceId: 'order-1', sequence: 1,
  });
  const rows = await repository.list({ referenceType: 'ORDER', referenceId: 'order-1' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].purpose, 'ORIGIN');
  assert.deepEqual((await repository.findById('origin-1')).metadata, { source: 'manual' });
});

test('straight-line distance is provider independent', () => {
  const meters = distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
  assert.ok(meters > 111000 && meters < 112000);
});

test('map operations delegate through adapter and fail closed without provider', async (t) => {
  const adapter = new FakeMapProviderAdapter({
    geocodeResult: { latitude: 37.5, longitude: 127.0 },
    reverseGeocodeResult: { address: '테스트 주소' },
    routeResult: { distanceMeters: 1200, durationSeconds: 300 },
    nearbyResult: [{ id: 'merchant-1' }],
  });
  const ctx = createContext({ mapProvider: adapter });
  t.after(() => ctx.database.close());
  assert.equal((await ctx.service.geocode('서울')).latitude, 37.5);
  assert.equal((await ctx.service.reverseGeocode({ latitude: 37.5, longitude: 127 })).address, '테스트 주소');
  assert.equal((await ctx.service.calculateRoute({ origin: {}, destination: {} })).distanceMeters, 1200);
  assert.equal((await ctx.service.searchNearby({ center: {}, radiusMeters: 1000 })).length, 1);

  const noProvider = createContext();
  t.after(() => noProvider.database.close());
  await assert.rejects(() => noProvider.service.geocode('서울'), /MAP_PROVIDER_NOT_CONFIGURED/);
});

test('authorization is deny-by-default and SELF scope enforces ownership', async (t) => {
  const { database, service, authorizationService } = createContext({ withAuthorization: true });
  t.after(() => database.close());
  await authorizationService.assignRole({ accountId: 'customer-1', roleCode: 'CUSTOMER' });
  await assert.rejects(() => service.createLocation({ actorAccountId: 'customer-1', ownerAccountId: 'customer-1', latitude: 37.5, longitude: 127 }), /FORBIDDEN/);
  await authorizationService.grantPermission({ roleCode: 'CUSTOMER', permissionCode: LocationPermission.CREATE, action: PermissionAction.CREATE, scope: PermissionScope.SELF });
  await authorizationService.grantPermission({ roleCode: 'CUSTOMER', permissionCode: LocationPermission.VIEW, action: PermissionAction.VIEW, scope: PermissionScope.SELF });
  const own = await service.createLocation({ actorAccountId: 'customer-1', ownerAccountId: 'customer-1', latitude: 37.5, longitude: 127 });
  assert.equal(own.ownerAccountId, 'customer-1');
  await assert.rejects(() => service.createLocation({ actorAccountId: 'customer-1', ownerAccountId: 'customer-2', locationId: 'location-2', latitude: 37.6, longitude: 127 }), /FORBIDDEN/);
  assert.equal((await service.getLocation(own.locationId, { actorAccountId: 'customer-1' })).locationId, own.locationId);
});

test('SERVICE_ADMIN location scope cannot cross services', async (t) => {
  const { database, service, authorizationService } = createContext({ withAuthorization: true });
  t.after(() => database.close());
  await authorizationService.assignRole({ accountId: 'service-admin', roleCode: 'SERVICE_ADMIN', serviceId: 'service-driving' });
  await authorizationService.grantPermission({ roleCode: 'SERVICE_ADMIN', permissionCode: LocationPermission.CREATE, action: PermissionAction.CREATE, scope: PermissionScope.SERVICE });
  await service.createLocation({ actorAccountId: 'service-admin', locationId: 'driving-location', serviceId: 'service-driving', latitude: 37.5, longitude: 127 });
  await assert.rejects(() => service.createLocation({ actorAccountId: 'service-admin', locationId: 'quick-location', serviceId: 'service-quick', latitude: 37.5, longitude: 127 }), /FORBIDDEN/);
});

test('route/search permissions are explicit and use SERVICE scope', async (t) => {
  const adapter = new FakeMapProviderAdapter({ routeResult: { distanceMeters: 100 }, nearbyResult: [] });
  const { database, service, authorizationService } = createContext({ withAuthorization: true, mapProvider: adapter });
  t.after(() => database.close());
  await authorizationService.assignRole({ accountId: 'provider-1', roleCode: 'PROVIDER', serviceId: 'service-driving' });
  await assert.rejects(() => service.calculateRoute({ origin: {}, destination: {}, serviceId: 'service-driving' }, { actorAccountId: 'provider-1' }), /FORBIDDEN/);
  await authorizationService.grantPermission({ roleCode: 'PROVIDER', permissionCode: LocationPermission.ROUTE, action: PermissionAction.VIEW, scope: PermissionScope.SERVICE });
  await authorizationService.grantPermission({ roleCode: 'PROVIDER', permissionCode: LocationPermission.SEARCH, action: PermissionAction.VIEW, scope: PermissionScope.SERVICE });
  assert.equal((await service.calculateRoute({ origin: {}, destination: {}, serviceId: 'service-driving' }, { actorAccountId: 'provider-1' })).distanceMeters, 100);
  assert.deepEqual(await service.searchNearby({ center: {}, radiusMeters: 500, serviceId: 'service-driving' }, { actorAccountId: 'provider-1' }), []);
  await assert.rejects(() => service.calculateRoute({ origin: {}, destination: {}, serviceId: 'service-quick' }, { actorAccountId: 'provider-1' }), /FORBIDDEN/);
});

test('DB constraint rejects invalid coordinates at persistence boundary', (t) => {
  const { database } = createContext();
  t.after(() => database.close());
  assert.throws(() => database.prepare(`
    INSERT INTO locations(location_id, purpose, latitude, longitude, sequence, created_at, updated_at)
    VALUES ('bad', 'CURRENT', 100, 0, 0, '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')
  `).run());
});
