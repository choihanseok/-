import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AuthorizationService } from '../src/authorization/authorization-service.js';
import { PermissionAction } from '../src/authorization/permission-action.js';
import { PermissionScope } from '../src/authorization/permission-scope.js';
import { SqliteAuthorizationRepository } from '../src/authorization/sqlite-authorization-repository.js';
import { MatchingMode } from '../src/matching/matching-mode.js';
import { MatchingPermission, MatchingService } from '../src/matching/matching-service.js';
import { MatchingStatus } from '../src/matching/matching-status.js';
import { SqliteMatchingRepository } from '../src/matching/sqlite-matching-repository.js';
import { OrderService } from '../src/order/order-service.js';
import { SqliteOrderRepository } from '../src/order/sqlite-order-repository.js';
import { Service } from '../src/service/service.js';
import { SqliteServiceRepository } from '../src/service/sqlite-service-repository.js';

const migration004 = readFileSync(new URL('../migrations/004_create_authorization.sql', import.meta.url), 'utf8');
const migration005 = readFileSync(new URL('../migrations/005_create_service_registry.sql', import.meta.url), 'utf8');
const migration007 = readFileSync(new URL('../migrations/007_create_orders.sql', import.meta.url), 'utf8');
const migration008 = readFileSync(new URL('../migrations/008_create_matchings.sql', import.meta.url), 'utf8');

async function createContext({ withAuthorization = true } = {}) {
  const database = new DatabaseSync(':memory:');
  database.exec(migration005);
  database.exec(migration007);
  database.exec(migration008);
  if (withAuthorization) database.exec(migration004);

  const serviceRepository = new SqliteServiceRepository({ database });
  const orderRepository = new SqliteOrderRepository({ database });
  const matchingRepository = new SqliteMatchingRepository({ database });
  const authorizationService = withAuthorization
    ? new AuthorizationService({
        authorizationRepository: new SqliteAuthorizationRepository({ database }),
        clock: () => new Date('2026-09-09T00:00:00.000Z'),
      })
    : null;

  await serviceRepository.save(new Service({
    serviceId: 'service-driving', serviceCode: 'DRIVING', serviceName: '대리운전', serviceType: 'MBS', status: 'ACTIVE',
    createdAt: new Date('2026-09-09T00:00:00.000Z'), updatedAt: new Date('2026-09-09T00:00:00.000Z'),
  }));

  let sequence = 0;
  const clock = () => new Date(`2026-09-09T00:01:${String(sequence++).padStart(2, '0')}.000Z`);
  const orderService = new OrderService({
    orderRepository, serviceRepository,
    idGenerator: () => `order-${sequence + 1}`,
    historyIdGenerator: () => `order-history-${sequence + 1}`,
    clock,
  });
  const matchingService = new MatchingService({
    matchingRepository,
    orderRepository,
    authorizationService,
    idGenerator: () => `matching-${sequence + 1}`,
    historyIdGenerator: () => `matching-history-${sequence + 1}`,
    clock,
  });

  async function createReceivedOrder(orderId = 'order-driving') {
    const order = await orderService.createOrder({ orderId, serviceCode: 'DRIVING', customerAccountId: 'customer-1' });
    await orderService.changeStatus(order.orderId, 'REQUESTED');
    return orderService.changeStatus(order.orderId, 'RECEIVED');
  }

  return { database, orderRepository, matchingRepository, authorizationService, orderService, matchingService, createReceivedOrder };
}

async function grantAdminAssign(ctx) {
  await ctx.authorizationService.assignRole({ accountId: 'service-admin', roleCode: 'SERVICE_ADMIN', serviceId: 'service-driving' });
  await ctx.authorizationService.grantPermission({ roleCode: 'SERVICE_ADMIN', permissionCode: MatchingPermission.ASSIGN, action: PermissionAction.ASSIGN, scope: PermissionScope.SERVICE });
  await ctx.authorizationService.grantPermission({ roleCode: 'SERVICE_ADMIN', permissionCode: MatchingPermission.VIEW, action: PermissionAction.VIEW, scope: PermissionScope.SERVICE });
}

async function grantProviderRespond(ctx, provider = 'provider-1') {
  await ctx.authorizationService.assignRole({ accountId: provider, roleCode: 'PROVIDER', serviceId: 'service-driving' });
  await ctx.authorizationService.grantPermission({ roleCode: 'PROVIDER', permissionCode: MatchingPermission.RESPOND, action: PermissionAction.APPROVE, scope: PermissionScope.ASSIGNED });
  await ctx.authorizationService.grantPermission({ roleCode: 'PROVIDER', permissionCode: MatchingPermission.VIEW, action: PermissionAction.VIEW, scope: PermissionScope.ASSIGNED });
}

test('starts matching and offers provider while synchronizing common Order states', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  await grantAdminAssign(ctx);
  const order = await ctx.createReceivedOrder();
  const searching = await ctx.matchingService.startMatching(order.orderId, { actorAccountId: 'service-admin' });
  assert.equal(searching.status, 'SEARCHING');
  const matching = await ctx.matchingService.offerProvider(order.orderId, 'provider-1', { actorAccountId: 'service-admin', mode: MatchingMode.MANUAL_ADMIN });
  assert.equal(matching.status, MatchingStatus.OFFERED);
  assert.equal((await ctx.orderRepository.findById(order.orderId)).status, 'ASSIGNED');
  assert.equal((await ctx.orderRepository.findById(order.orderId)).providerAccountId, 'provider-1');
});

test('provider accepts only its assigned matching and Order becomes ACCEPTED', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  await grantAdminAssign(ctx);
  await grantProviderRespond(ctx);
  const order = await ctx.createReceivedOrder();
  await ctx.matchingService.startMatching(order.orderId, { actorAccountId: 'service-admin' });
  const matching = await ctx.matchingService.offerProvider(order.orderId, 'provider-1', { actorAccountId: 'service-admin' });
  const accepted = await ctx.matchingService.accept(matching.matchingId, { actorAccountId: 'provider-1' });
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal((await ctx.orderRepository.findById(order.orderId)).status, 'ACCEPTED');
});

test('provider rejection clears assignment and returns Order to SEARCHING', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  await grantAdminAssign(ctx);
  await grantProviderRespond(ctx);
  const order = await ctx.createReceivedOrder();
  await ctx.matchingService.startMatching(order.orderId, { actorAccountId: 'service-admin' });
  const matching = await ctx.matchingService.offerProvider(order.orderId, 'provider-1', { actorAccountId: 'service-admin' });
  const rejected = await ctx.matchingService.reject(matching.matchingId, { actorAccountId: 'provider-1', reason: 'UNAVAILABLE' });
  const updated = await ctx.orderRepository.findById(order.orderId);
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(updated.status, 'SEARCHING');
  assert.equal(updated.providerAccountId, null);
});

test('reassignment preserves previous attempt and creates a new immutable attempt number', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  await grantAdminAssign(ctx);
  await grantProviderRespond(ctx);
  const order = await ctx.createReceivedOrder();
  await ctx.matchingService.startMatching(order.orderId, { actorAccountId: 'service-admin' });
  const first = await ctx.matchingService.offerProvider(order.orderId, 'provider-1', { actorAccountId: 'service-admin' });
  await ctx.matchingService.reject(first.matchingId, { actorAccountId: 'provider-1', reason: 'BUSY' });
  const second = await ctx.matchingService.offerProvider(order.orderId, 'provider-2', { actorAccountId: 'service-admin' });
  const rows = await ctx.matchingRepository.listByOrderId(order.orderId);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.attemptNo), [1, 2]);
  assert.deepEqual(rows.map((row) => row.providerAccountId), ['provider-1', 'provider-2']);
  assert.equal(second.status, 'OFFERED');
});

test('deny by default blocks matching assignment without explicit permission', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  await ctx.authorizationService.assignRole({ accountId: 'service-admin', roleCode: 'SERVICE_ADMIN', serviceId: 'service-driving' });
  const order = await ctx.createReceivedOrder();
  await assert.rejects(() => ctx.matchingService.startMatching(order.orderId, { actorAccountId: 'service-admin' }), /FORBIDDEN/);
});

test('another provider cannot accept or reject somebody else assigned matching', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  await grantAdminAssign(ctx);
  await grantProviderRespond(ctx, 'provider-1');
  await ctx.authorizationService.assignRole({ accountId: 'provider-2', roleCode: 'PROVIDER', serviceId: 'service-driving' });
  const order = await ctx.createReceivedOrder();
  await ctx.matchingService.startMatching(order.orderId, { actorAccountId: 'service-admin' });
  const matching = await ctx.matchingService.offerProvider(order.orderId, 'provider-1', { actorAccountId: 'service-admin' });
  await assert.rejects(() => ctx.matchingService.accept(matching.matchingId, { actorAccountId: 'provider-2' }), /FORBIDDEN|MATCHING_RESPONSE_ACTOR_MISMATCH/);
});

test('duplicate accept is idempotent and does not duplicate Order status history', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  await grantAdminAssign(ctx);
  await grantProviderRespond(ctx);
  const order = await ctx.createReceivedOrder();
  await ctx.matchingService.startMatching(order.orderId, { actorAccountId: 'service-admin' });
  const matching = await ctx.matchingService.offerProvider(order.orderId, 'provider-1', { actorAccountId: 'service-admin' });
  await ctx.matchingService.accept(matching.matchingId, { actorAccountId: 'provider-1' });
  await ctx.matchingService.accept(matching.matchingId, { actorAccountId: 'provider-1' });
  const history = await ctx.orderRepository.listStatusHistory(order.orderId);
  assert.equal(history.filter((row) => row.toStatus === 'ACCEPTED').length, 1);
});

test('DB constraints reject invalid Matching mode/status and duplicate attempt number', async (t) => {
  const ctx = await createContext({ withAuthorization: false });
  t.after(() => ctx.database.close());
  assert.throws(() => ctx.database.prepare(`
    INSERT INTO matchings(matching_id, order_id, service_id, mode, status, attempt_no, created_at, updated_at)
    VALUES ('bad', 'order-1', 'service-driving', 'INVALID', 'OFFERED', 1, '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')
  `).run());
  ctx.database.prepare(`
    INSERT INTO matchings(matching_id, order_id, service_id, mode, status, attempt_no, created_at, updated_at)
    VALUES ('m1', 'order-1', 'service-driving', 'AUTO', 'REQUESTED', 1, '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')
  `).run();
  assert.throws(() => ctx.database.prepare(`
    INSERT INTO matchings(matching_id, order_id, service_id, mode, status, attempt_no, created_at, updated_at)
    VALUES ('m2', 'order-1', 'service-driving', 'AUTO', 'REQUESTED', 1, '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')
  `).run());
});
