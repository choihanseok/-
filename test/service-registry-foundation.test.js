import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Service } from '../src/service/service.js';
import { ServiceStatus } from '../src/service/service-status.js';
import { ServiceType } from '../src/service/service-type.js';
import { SqliteServiceRepository } from '../src/service/sqlite-service-repository.js';
import { ServicePermission, ServiceRegistryService } from '../src/service/service-registry-service.js';
import { seedPhase1Services } from '../src/service/phase1-service-seed.js';
import { SqliteAuthorizationRepository } from '../src/authorization/sqlite-authorization-repository.js';
import { AuthorizationService } from '../src/authorization/authorization-service.js';
import { RoleCode } from '../src/authorization/role-code.js';
import { PermissionAction } from '../src/authorization/permission-action.js';
import { PermissionScope } from '../src/authorization/permission-scope.js';

function migration(name) {
  return readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
}

function createContext({ withAuthorization = false } = {}) {
  const database = new DatabaseSync(':memory:');
  database.exec(migration('005_create_service_registry.sql'));
  const repository = new SqliteServiceRepository({ database });
  let seq = 0;
  let tick = 0;
  let authorizationService = null;
  if (withAuthorization) {
    database.exec(migration('004_create_authorization.sql'));
    authorizationService = new AuthorizationService({
      authorizationRepository: new SqliteAuthorizationRepository({ database }),
      clock: () => new Date('2026-09-09T12:00:00.000Z'),
    });
  }
  const service = new ServiceRegistryService({
    serviceRepository: repository,
    authorizationService,
    idGenerator: () => `service-${++seq}`,
    clock: () => new Date(`2026-09-09T12:${String(tick++).padStart(2, '0')}:00.000Z`),
  });
  return { database, repository, service, authorizationService };
}

test('service master accepts valid ServiceType and rejects unknown type', () => {
  const valid = new Service({ serviceId: 's1', serviceCode: 'DRIVING', serviceName: '대리운전', serviceType: ServiceType.MBS });
  assert.equal(valid.serviceType, ServiceType.MBS);
  assert.throws(() => new Service({ serviceId: 's2', serviceCode: 'X', serviceName: 'X', serviceType: 'UNKNOWN' }), /SERVICE_TYPE_INVALID/);
});

test('registers, finds and filters services through SQLite repository', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());
  const driving = await service.registerService({ serviceCode: 'DRIVING', serviceName: '대리운전', serviceType: ServiceType.MBS, status: ServiceStatus.ACTIVE });
  await service.registerService({ serviceCode: 'ERRAND', serviceName: '심부름서비스', serviceType: ServiceType.AGC });
  assert.equal((await service.getService(driving.serviceId)).serviceCode, 'DRIVING');
  assert.equal((await service.getServiceByCode('DRIVING')).serviceId, driving.serviceId);
  assert.deepEqual((await service.listServices({ serviceType: ServiceType.MBS })).map((x) => x.serviceCode), ['DRIVING']);
  assert.deepEqual((await service.listServices({ status: ServiceStatus.DRAFT })).map((x) => x.serviceCode), ['ERRAND']);
});

test('rejects duplicate serviceCode', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());
  await service.registerService({ serviceCode: 'QUICK', serviceName: '퀵서비스', serviceType: ServiceType.MBS });
  await assert.rejects(() => service.registerService({ serviceCode: 'QUICK', serviceName: '다른퀵', serviceType: ServiceType.MBS }), /SERVICE_CODE_ALREADY_EXISTS/);
});

test('changes status and persists configuration across repository reload', async (t) => {
  const { database, repository, service } = createContext();
  t.after(() => database.close());
  const created = await service.registerService({ serviceCode: 'ERRAND', serviceName: '심부름서비스', serviceType: ServiceType.AGC });
  await service.changeStatus(created.serviceId, ServiceStatus.ACTIVE);
  await service.setConfiguration(created.serviceId, 'matching', { mode: 'MANUAL', radiusKm: 10 });
  const reloadedRepository = new SqliteServiceRepository({ database });
  assert.equal((await reloadedRepository.findById(created.serviceId)).status, ServiceStatus.ACTIVE);
  assert.deepEqual(await reloadedRepository.getConfig(created.serviceId, 'matching'), { mode: 'MANUAL', radiusKm: 10 });
  assert.deepEqual(await repository.getConfig(created.serviceId, 'matching'), { mode: 'MANUAL', radiusKm: 10 });
});

test('Phase 1 seed is idempotent, preserves existing data and does not guess FLOWER type', async (t) => {
  const { database, repository } = createContext();
  t.after(() => database.close());
  await repository.save(new Service({ serviceId: 'existing-driving', serviceCode: 'DRIVING', serviceName: '운영자가 수정한 대리운전', serviceType: ServiceType.MBS, status: ServiceStatus.ACTIVE }));
  const ids = (code) => `seed-${code}`;
  const first = await seedPhase1Services({ serviceRepository: repository, idGenerator: ids, flowerServiceType: ServiceType.BUY });
  const second = await seedPhase1Services({ serviceRepository: repository, idGenerator: ids, flowerServiceType: ServiceType.BUY });
  assert.equal((await repository.findByCode('DRIVING')).serviceName, '운영자가 수정한 대리운전');
  assert.deepEqual((await repository.list()).map((x) => x.serviceCode), ['DRIVING', 'ERRAND', 'FLOWER', 'QUICK']);
  assert.ok(first.preserved.includes('DRIVING'));
  assert.deepEqual(second.created, []);

  const other = createContext();
  t.after(() => other.database.close());
  const noFlower = await seedPhase1Services({ serviceRepository: other.repository, idGenerator: ids });
  assert.equal(await other.repository.findByCode('FLOWER'), null);
  assert.deepEqual(noFlower.skipped, [{ serviceCode: 'FLOWER', reason: 'SERVICE_TYPE_NEED_REVIEW' }]);
});

test('authorization is deny-by-default and SERVICE_ADMIN cannot cross service scope', async (t) => {
  const { database, service, authorizationService } = createContext({ withAuthorization: true });
  t.after(() => database.close());
  const driving = await service.serviceRepository.save(new Service({ serviceId: 'svc-driving', serviceCode: 'DRIVING', serviceName: '대리운전', serviceType: ServiceType.MBS }));
  const quick = await service.serviceRepository.save(new Service({ serviceId: 'svc-quick', serviceCode: 'QUICK', serviceName: '퀵서비스', serviceType: ServiceType.MBS }));
  await authorizationService.assignRole({ accountId: 'admin-service', roleCode: RoleCode.SERVICE_ADMIN, serviceId: driving.serviceId });
  await authorizationService.grantPermission({ roleCode: RoleCode.SERVICE_ADMIN, permissionCode: ServicePermission.VIEW, action: PermissionAction.VIEW, scope: PermissionScope.SERVICE });
  assert.equal((await service.getService(driving.serviceId, { actorAccountId: 'admin-service' })).serviceCode, 'DRIVING');
  await assert.rejects(() => service.getService(quick.serviceId, { actorAccountId: 'admin-service' }), /FORBIDDEN/);
  await assert.rejects(() => service.getService(driving.serviceId, { actorAccountId: 'no-role' }), /FORBIDDEN/);
});

test('PLATFORM_ADMIN and SUPER_ADMIN require explicit permission paths', async (t) => {
  const { database, service, authorizationService } = createContext({ withAuthorization: true });
  t.after(() => database.close());
  await service.serviceRepository.save(new Service({ serviceId: 'svc-one', serviceCode: 'DRIVING', serviceName: '대리운전', serviceType: ServiceType.MBS }));
  await authorizationService.assignRole({ accountId: 'platform-admin', roleCode: RoleCode.PLATFORM_ADMIN });
  await assert.rejects(() => service.getService('svc-one', { actorAccountId: 'platform-admin' }), /FORBIDDEN/);
  await authorizationService.grantPermission({ roleCode: RoleCode.PLATFORM_ADMIN, permissionCode: ServicePermission.VIEW, action: PermissionAction.VIEW, scope: PermissionScope.PLATFORM });
  assert.equal((await service.getService('svc-one', { actorAccountId: 'platform-admin' })).serviceCode, 'DRIVING');

  await authorizationService.assignRole({ accountId: 'super-admin', roleCode: RoleCode.SUPER_ADMIN });
  await authorizationService.grantPermission({ roleCode: RoleCode.SUPER_ADMIN, permissionCode: ServicePermission.CHANGE_STATUS, action: PermissionAction.UPDATE, scope: PermissionScope.SYSTEM });
  const changed = await service.changeStatus('svc-one', ServiceStatus.ACTIVE, { actorAccountId: 'super-admin' });
  assert.equal(changed.status, ServiceStatus.ACTIVE);
});
