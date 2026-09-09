import { randomUUID } from 'node:crypto';
import { Service } from './service.js';
import { ServiceStatus, assertServiceStatus } from './service-status.js';
import { assertServiceType } from './service-type.js';
import { PermissionAction } from '../authorization/permission-action.js';

export const ServicePermission = Object.freeze({
  VIEW: 'SERVICE.VIEW',
  CREATE: 'SERVICE.CREATE',
  UPDATE: 'SERVICE.UPDATE',
  MANAGE_CONFIG: 'SERVICE.MANAGE_CONFIG',
  CHANGE_STATUS: 'SERVICE.CHANGE_STATUS',
});

export class ServiceRegistryService {
  constructor({ serviceRepository, authorizationService = null, idGenerator = randomUUID, clock = () => new Date() }) {
    if (!serviceRepository) throw new TypeError('SERVICE_REPOSITORY_REQUIRED');
    this.serviceRepository = serviceRepository;
    this.authorizationService = authorizationService;
    this.idGenerator = idGenerator;
    this.clock = clock;
  }

  async #require(actorAccountId, permissionCode, action, resource = {}) {
    if (!this.authorizationService) return null;
    if (!actorAccountId) throw new TypeError('ACTOR_ACCOUNT_ID_REQUIRED');
    return this.authorizationService.requirePermission({ accountId: actorAccountId, permissionCode, action, resource });
  }

  async registerService({ actorAccountId = null, serviceCode, serviceName, serviceType, status = ServiceStatus.DRAFT, category = null, description = null, configuration = {} }) {
    if (!serviceCode) throw new TypeError('SERVICE_CODE_REQUIRED');
    if (!serviceName) throw new TypeError('SERVICE_NAME_REQUIRED');
    if (!serviceType) throw new TypeError('SERVICE_TYPE_REQUIRED');
    assertServiceType(serviceType);
    assertServiceStatus(status);
    await this.#require(actorAccountId, ServicePermission.CREATE, PermissionAction.CREATE, {});

    if (await this.serviceRepository.findByCode(serviceCode)) throw new Error('SERVICE_CODE_ALREADY_EXISTS');
    const now = this.clock();
    return this.serviceRepository.save(new Service({
      serviceId: this.idGenerator(), serviceCode, serviceName, serviceType, status,
      category, description, configuration, createdAt: now, updatedAt: now,
    }));
  }

  async getService(serviceId, { actorAccountId = null } = {}) {
    const service = await this.serviceRepository.findById(serviceId);
    if (!service) throw new Error('SERVICE_NOT_FOUND');
    await this.#require(actorAccountId, ServicePermission.VIEW, PermissionAction.VIEW, { serviceId: service.serviceId });
    return service;
  }

  async getServiceByCode(serviceCode, { actorAccountId = null } = {}) {
    const service = await this.serviceRepository.findByCode(serviceCode);
    if (!service) throw new Error('SERVICE_NOT_FOUND');
    await this.#require(actorAccountId, ServicePermission.VIEW, PermissionAction.VIEW, { serviceId: service.serviceId });
    return service;
  }

  async listServices(filter = {}, { actorAccountId = null } = {}) {
    const services = await this.serviceRepository.list(filter);
    if (!this.authorizationService) return services;
    const allowed = [];
    for (const service of services) {
      const result = await this.authorizationService.authorize({
        accountId: actorAccountId,
        permissionCode: ServicePermission.VIEW,
        action: PermissionAction.VIEW,
        resource: { serviceId: service.serviceId },
      });
      if (result.allowed) allowed.push(service);
    }
    return allowed;
  }

  async changeStatus(serviceId, status, { actorAccountId = null } = {}) {
    assertServiceStatus(status);
    const service = await this.serviceRepository.findById(serviceId);
    if (!service) throw new Error('SERVICE_NOT_FOUND');
    await this.#require(actorAccountId, ServicePermission.CHANGE_STATUS, PermissionAction.UPDATE, { serviceId });
    return this.serviceRepository.save(service.withStatus(status, this.clock()));
  }

  async setConfiguration(serviceId, key, value, { actorAccountId = null } = {}) {
    if (!key) throw new TypeError('SERVICE_CONFIG_KEY_REQUIRED');
    if (value === undefined) throw new TypeError('SERVICE_CONFIGURATION_INVALID');
    const service = await this.serviceRepository.findById(serviceId);
    if (!service) throw new Error('SERVICE_NOT_FOUND');
    await this.#require(actorAccountId, ServicePermission.MANAGE_CONFIG, PermissionAction.UPDATE, { serviceId });
    return this.serviceRepository.saveConfig(serviceId, key, value, this.clock());
  }

  async getConfiguration(serviceId, key, { actorAccountId = null } = {}) {
    const service = await this.serviceRepository.findById(serviceId);
    if (!service) throw new Error('SERVICE_NOT_FOUND');
    await this.#require(actorAccountId, ServicePermission.VIEW, PermissionAction.VIEW, { serviceId });
    return this.serviceRepository.getConfig(serviceId, key);
  }
}
