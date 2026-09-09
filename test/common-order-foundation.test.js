import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AuthorizationService } from '../src/authorization/authorization-service.js';
import { PermissionAction } from '../src/authorization/permission-action.js';
import { PermissionScope } from '../src/authorization/permission-scope.js';
import { SqliteAuthorizationRepository } from '../src/authorization/sqlite-authorization-repository.js';
import { Location } from '../src/location/location.js';
import { SqliteLocationRepository } from '../src/location/sqlite-location-repository.js';
import { OrderPermission, OrderService } from '../src/order/order-service.js';
import { OrderStatus } from '../src/order/order-status.js';
import { SqliteOrderRepository } from '../src/order/sqlite-order-repository.js';
import { Service } from '../src/service/service.js';
import { SqliteServiceRepository } from '../src/service/sqlite-service-repository.js';

const migration004 = readFileSync(new URL('../migrations/004_create_authorization.sql', import.meta.url), 'utf8');
const migration005 = readFileSync(new URL('../migrations/005_create_service_registry.sql', import.meta.url), 'utf8');
const migration006 = readFileSync(new URL('../migrations/006_create_locations.sql', import.meta.url), 'utf8');
const migration007 = readFileSync(new URL('../migrations/007_create_orders.sql', import.meta.url), 'utf8');

async function createContext({ withAuthorization = false } = {}) {
  const database = new DatabaseSync(':memory:');
  database.exec(migration005);
  database.exec(migration006);
  database.exec(migration007);
  if (withAuthorization) database.exec(migration004);

  const serviceRepository = new SqliteServiceRepository({ database });
  const locationRepository = new SqliteLocationRepository({ database });
  const orderRepository = new SqliteOrderRepository({ database });
  const authorizationService = withAuthorization
    ? new AuthorizationService({
        authorizationRepository: new SqliteAuthorizationRepository({ database }),
        clock: () => new Date('2026-09-09T00:00:00.000Z'),
      })
    : null;

  await serviceRepository.save(new Service({
    serviceId: 'service-driving',
    serviceCode: 'DRIVING',
    serviceName: '대리운전',
    serviceType: 'MBS',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-09T00:00:00.000Z'),
    updatedAt: new Date('2026-09-09T00:00:00.000Z'),
  }));
  await serviceRepository.save(new Service({
    serviceId: 'service-quick',
    serviceCode: 'QUICK',
    serviceName: '퀵서비스',
    serviceType: 'MBS',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-09T00:00:00.000Z'),
    updatedAt: new Date('2026-09-09T00:00:00.000Z'),
  }));

  let sequence = 0;
  const orderService = new OrderService({
    orderRepository,
    serviceRepository,
    locationRepository,
    authorizationService,
    idGenerator: () => `order-${++sequence}`,
    historyIdGenerator: () => `history-${++sequence}`,
    clock: () => new Date(`2026-09-09T00:00:${String(sequence).padStart(2, '0')}.000Z`),
  });
  return { database, serviceRepository, locationRepository, orderRepository, authorizationService, orderService };
}

async function grantCustomerCreate(ctx, accountId = 'customer-1') {
  await ctx.authorizationService.assignRole({ accountId, roleCode: 'CUSTOMER' });
  await ctx.authorizationService.grantPermission({
    roleCode: 'CUSTOMER',
    permissionCode: OrderPermission.CREATE,
    action: PermissionAction.CREATE,
    scope: PermissionScope.SELF,
  });
}

test('creates one common Order using Service Registry identity and persists creation history', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  const order = await ctx.orderService.createOrder({ serviceCode: 'DRIVING', customerAccountId: 'customer-1' });
  assert.equal(order.serviceId, 'service-driving');
  assert.equal(order.serviceCode, 'DRIVING');
  assert.equal(order.status, OrderStatus.DRAFT);
  const history = await ctx.orderRepository.listStatusHistory(order.orderId);
  assert.equal(history.length, 1);
  assert.equal(history[0].fromStatus, null);
  assert.equal(history[0].toStatus, 'DRAFT');
});

test('rejects missing service and serviceId/serviceCode mismatch', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  await assert.rejects(() => ctx.orderService.createOrder({ serviceCode: 'UNKNOWN', customerAccountId: 'customer-1' }), /ORDER_SERVICE_NOT_FOUND/);
  await assert.rejects(() => ctx.orderService.createOrder({ serviceId: 'service-driving', serviceCode: 'QUICK', customerAccountId: 'customer-1' }), /ORDER_SERVICE_MISMATCH/);
});

test('enforces coded status transitions and appends immutable status history', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  const order = await ctx.orderService.createOrder({ serviceCode: 'DRIVING', customerAccountId: 'customer-1' });
  await ctx.orderService.changeStatus(order.orderId, 'REQUESTED', { reason: 'customer submit' });
  await ctx.orderService.changeStatus(order.orderId, 'RECEIVED', { reason: 'operator receive' });
  await ctx.orderService.changeStatus(order.orderId, 'SEARCHING');
  const updated = await ctx.orderService.changeStatus(order.orderId, 'ASSIGNED');
  assert.equal(updated.status, 'ASSIGNED');
  const history = await ctx.orderRepository.listStatusHistory(order.orderId);
  assert.deepEqual(history.map((row) => row.toStatus), ['DRAFT', 'REQUESTED', 'RECEIVED', 'SEARCHING', 'ASSIGNED']);
  await assert.rejects(() => ctx.orderService.changeStatus(order.orderId, 'COMPLETED'), /ORDER_STATUS_TRANSITION_INVALID/);
});

test('repeated transition to current status is idempotent and does not duplicate history', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  const order = await ctx.orderService.createOrder({ serviceCode: 'DRIVING', customerAccountId: 'customer-1' });
  await ctx.orderService.changeStatus(order.orderId, 'REQUESTED');
  await ctx.orderService.changeStatus(order.orderId, 'REQUESTED');
  const history = await ctx.orderRepository.listStatusHistory(order.orderId);
  assert.equal(history.length, 2);
});

test('Order can read common locations linked by referenceType/referenceId without service-specific columns', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  const order = await ctx.orderService.createOrder({ orderId: 'order-location', serviceCode: 'DRIVING', customerAccountId: 'customer-1' });
  await ctx.locationRepository.save(new Location({
    locationId: 'origin-1', purpose: 'ORIGIN', latitude: 37.5, longitude: 127,
    ownerAccountId: 'customer-1', serviceId: order.serviceId, referenceType: 'ORDER', referenceId: order.orderId, sequence: 0,
  }));
  await ctx.locationRepository.save(new Location({
    locationId: 'destination-1', purpose: 'DESTINATION', latitude: 37.6, longitude: 127.1,
    ownerAccountId: 'customer-1', serviceId: order.serviceId, referenceType: 'ORDER', referenceId: order.orderId, sequence: 1,
  }));
  const locations = await ctx.orderService.listOrderLocations(order.orderId);
  assert.deepEqual(locations.map((row) => row.purpose), ['ORIGIN', 'DESTINATION']);
});

test('authorization is deny-by-default and CUSTOMER SELF cannot read another customer order', async (t) => {
  const ctx = await createContext({ withAuthorization: true });
  t.after(() => ctx.database.close());
  await ctx.authorizationService.assignRole({ accountId: 'customer-1', roleCode: 'CUSTOMER' });
  await ctx.authorizationService.assignRole({ accountId: 'customer-2', roleCode: 'CUSTOMER' });
  await assert.rejects(() => ctx.orderService.createOrder({ actorAccountId: 'customer-1', serviceCode: 'DRIVING', customerAccountId: 'customer-1' }), /FORBIDDEN/);
  await ctx.authorizationService.grantPermission({ roleCode: 'CUSTOMER', permissionCode: OrderPermission.CREATE, action: PermissionAction.CREATE, scope: PermissionScope.SELF });
  await ctx.authorizationService.grantPermission({ roleCode: 'CUSTOMER', permissionCode: OrderPermission.VIEW, action: PermissionAction.VIEW, scope: PermissionScope.SELF });
  const own = await ctx.orderService.createOrder({ actorAccountId: 'customer-1', serviceCode: 'DRIVING', customerAccountId: 'customer-1' });
  assert.equal((await ctx.orderService.getOrder(own.orderId, { actorAccountId: 'customer-1' })).orderId, own.orderId);
  await assert.rejects(() => ctx.orderService.getOrder(own.orderId, { actorAccountId: 'customer-2' }), /FORBIDDEN/);
});

test('SERVICE_ADMIN status permission is restricted to assigned service scope', async (t) => {
  const ctx = await createContext({ withAuthorization: true });
  t.after(() => ctx.database.close());
  await grantCustomerCreate(ctx);
  const driving = await ctx.orderService.createOrder({ actorAccountId: 'customer-1', serviceCode: 'DRIVING', customerAccountId: 'customer-1' });
  const quick = await ctx.orderService.createOrder({ actorAccountId: 'customer-1', serviceCode: 'QUICK', customerAccountId: 'customer-1' });
  await ctx.authorizationService.assignRole({ accountId: 'service-admin', roleCode: 'SERVICE_ADMIN', serviceId: 'service-driving' });
  await ctx.authorizationService.grantPermission({ roleCode: 'SERVICE_ADMIN', permissionCode: OrderPermission.CHANGE_STATUS, action: PermissionAction.UPDATE, scope: PermissionScope.SERVICE });
  await ctx.orderService.changeStatus(driving.orderId, 'REQUESTED', { actorAccountId: 'service-admin' });
  await assert.rejects(() => ctx.orderService.changeStatus(quick.orderId, 'REQUESTED', { actorAccountId: 'service-admin' }), /FORBIDDEN/);
});

test('provider assignment requires explicit ASSIGN permission and supports ASSIGNED ownership later', async (t) => {
  const ctx = await createContext({ withAuthorization: true });
  t.after(() => ctx.database.close());
  await grantCustomerCreate(ctx);
  const order = await ctx.orderService.createOrder({ actorAccountId: 'customer-1', serviceCode: 'DRIVING', customerAccountId: 'customer-1' });
  await ctx.authorizationService.assignRole({ accountId: 'service-admin', roleCode: 'SERVICE_ADMIN', serviceId: 'service-driving' });
  await assert.rejects(() => ctx.orderService.assignProvider(order.orderId, 'provider-1', { actorAccountId: 'service-admin' }), /FORBIDDEN/);
  await ctx.authorizationService.grantPermission({ roleCode: 'SERVICE_ADMIN', permissionCode: OrderPermission.ASSIGN, action: PermissionAction.ASSIGN, scope: PermissionScope.SERVICE });
  const assigned = await ctx.orderService.assignProvider(order.orderId, 'provider-1', { actorAccountId: 'service-admin' });
  assert.equal(assigned.providerAccountId, 'provider-1');
});

test('DB constraints reject invalid OrderStatus at persistence boundary', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  assert.throws(() => ctx.database.prepare(`
    INSERT INTO orders(order_id, service_id, service_code, customer_account_id, status, metadata_json, created_at, updated_at)
    VALUES ('bad-order', 'service-driving', 'DRIVING', 'customer-1', 'UNKNOWN', '{}', '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')
  `).run());
});
