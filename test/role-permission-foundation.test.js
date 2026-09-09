import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { RoleCode } from '../src/authorization/role-code.js';
import { PermissionAction } from '../src/authorization/permission-action.js';
import { PermissionScope } from '../src/authorization/permission-scope.js';
import { AuthorizationService } from '../src/authorization/authorization-service.js';
import { SqliteAuthorizationRepository } from '../src/authorization/sqlite-authorization-repository.js';

function createContext() {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('../migrations/004_create_authorization.sql', import.meta.url), 'utf8'));
  const repository = new SqliteAuthorizationRepository({ database });
  const service = new AuthorizationService({
    authorizationRepository: repository,
    clock: () => new Date('2026-09-09T11:30:00.000Z'),
  });
  return { database, repository, service };
}

async function grant(service, { accountId, roleCode, permissionCode = 'ORDER', action = PermissionAction.VIEW, scope, ...assignment }) {
  await service.assignRole({ accountId, roleCode, ...assignment });
  await service.grantPermission({ roleCode, permissionCode, action, scope });
}

test('role master contains exactly the seven ZERO CALL roles', () => {
  assert.deepEqual(Object.values(RoleCode), [
    'CUSTOMER', 'PROVIDER', 'MERCHANT', 'SERVICE_ADMIN', 'DISTRIBUTOR', 'PLATFORM_ADMIN', 'SUPER_ADMIN',
  ]);
});

test('deny by default when account has no matching permission', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());
  const result = await service.authorize({ accountId: 'a1', permissionCode: 'ORDER', action: PermissionAction.VIEW });
  assert.deepEqual(result, { allowed: false, reason: 'FORBIDDEN' });
});

test('SELF scope requires ownership', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());
  await grant(service, { accountId: 'customer-1', roleCode: RoleCode.CUSTOMER, scope: PermissionScope.SELF });
  assert.equal((await service.authorize({ accountId: 'customer-1', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { ownerAccountId: 'customer-1' } })).allowed, true);
  assert.equal((await service.authorize({ accountId: 'customer-1', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { ownerAccountId: 'customer-2' } })).allowed, false);
});

test('ASSIGNED scope requires resource assignment to same account', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());
  await grant(service, { accountId: 'provider-1', roleCode: RoleCode.PROVIDER, scope: PermissionScope.ASSIGNED });
  assert.equal((await service.authorize({ accountId: 'provider-1', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { assignedAccountId: 'provider-1' } })).allowed, true);
  assert.equal((await service.authorize({ accountId: 'provider-1', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { assignedAccountId: 'provider-2' } })).allowed, false);
});

test('MERCHANT, SERVICE and DISTRIBUTOR scopes enforce assignment boundaries', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());
  await grant(service, { accountId: 'merchant-user', roleCode: RoleCode.MERCHANT, scope: PermissionScope.MERCHANT, merchantId: 'm1' });
  await grant(service, { accountId: 'service-admin', roleCode: RoleCode.SERVICE_ADMIN, scope: PermissionScope.SERVICE, serviceId: 'DRIVING' });
  await grant(service, { accountId: 'distributor-user', roleCode: RoleCode.DISTRIBUTOR, scope: PermissionScope.DISTRIBUTOR, distributorId: 'd1' });
  assert.equal((await service.authorize({ accountId: 'merchant-user', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { merchantId: 'm1' } })).allowed, true);
  assert.equal((await service.authorize({ accountId: 'merchant-user', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { merchantId: 'm2' } })).allowed, false);
  assert.equal((await service.authorize({ accountId: 'service-admin', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { serviceId: 'DRIVING' } })).allowed, true);
  assert.equal((await service.authorize({ accountId: 'service-admin', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { serviceId: 'QUICK' } })).allowed, false);
  assert.equal((await service.authorize({ accountId: 'distributor-user', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { distributorId: 'd1' } })).allowed, true);
  assert.equal((await service.authorize({ accountId: 'distributor-user', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { distributorId: 'd2' } })).allowed, false);
});

test('PLATFORM scope can cross service boundaries but only with an explicit grant', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());
  await grant(service, { accountId: 'platform-admin', roleCode: RoleCode.PLATFORM_ADMIN, scope: PermissionScope.PLATFORM });
  assert.equal((await service.authorize({ accountId: 'platform-admin', permissionCode: 'ORDER', action: PermissionAction.VIEW, resource: { serviceId: 'QUICK', merchantId: 'm9' } })).allowed, true);
  assert.equal((await service.authorize({ accountId: 'platform-admin', permissionCode: 'PAYMENT', action: PermissionAction.VIEW })).allowed, false);
});

test('SYSTEM scope is valid only for SUPER_ADMIN even if another role is accidentally granted it', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());
  await grant(service, { accountId: 'super', roleCode: RoleCode.SUPER_ADMIN, permissionCode: 'SYSTEM_CONFIG', action: PermissionAction.MANAGE, scope: PermissionScope.SYSTEM });
  await grant(service, { accountId: 'platform', roleCode: RoleCode.PLATFORM_ADMIN, permissionCode: 'SYSTEM_CONFIG', action: PermissionAction.MANAGE, scope: PermissionScope.SYSTEM });
  assert.equal((await service.authorize({ accountId: 'super', permissionCode: 'SYSTEM_CONFIG', action: PermissionAction.MANAGE })).allowed, true);
  assert.equal((await service.authorize({ accountId: 'platform', permissionCode: 'SYSTEM_CONFIG', action: PermissionAction.MANAGE })).allowed, false);
});

test('one account can hold multiple roles and authorization succeeds through any matching active role', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());
  await grant(service, { accountId: 'multi', roleCode: RoleCode.CUSTOMER, permissionCode: 'PROFILE', action: PermissionAction.VIEW, scope: PermissionScope.SELF });
  await grant(service, { accountId: 'multi', roleCode: RoleCode.PROVIDER, permissionCode: 'ORDER', action: PermissionAction.UPDATE, scope: PermissionScope.ASSIGNED });
  assert.equal((await service.authorize({ accountId: 'multi', permissionCode: 'PROFILE', action: PermissionAction.VIEW, resource: { ownerAccountId: 'multi' } })).allowed, true);
  assert.equal((await service.authorize({ accountId: 'multi', permissionCode: 'ORDER', action: PermissionAction.UPDATE, resource: { assignedAccountId: 'multi' } })).allowed, true);
});
