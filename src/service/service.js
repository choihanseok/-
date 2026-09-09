import { ServiceStatus, assertServiceStatus } from './service-status.js';
import { assertServiceType } from './service-type.js';

function cloneConfiguration(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('SERVICE_CONFIGURATION_INVALID');
  return structuredClone(value);
}

export class Service {
  constructor({
    serviceId,
    serviceCode,
    serviceName,
    serviceType,
    status = ServiceStatus.DRAFT,
    category = null,
    description = null,
    configuration = {},
    createdAt = new Date(),
    updatedAt = new Date(),
  }) {
    if (!serviceId) throw new TypeError('SERVICE_ID_REQUIRED');
    if (!serviceCode) throw new TypeError('SERVICE_CODE_REQUIRED');
    if (!serviceName) throw new TypeError('SERVICE_NAME_REQUIRED');
    if (!serviceType) throw new TypeError('SERVICE_TYPE_REQUIRED');
    assertServiceType(serviceType);
    assertServiceStatus(status);

    this.serviceId = serviceId;
    this.serviceCode = serviceCode;
    this.serviceName = serviceName;
    this.serviceType = serviceType;
    this.status = status;
    this.category = category;
    this.description = description;
    this.configuration = cloneConfiguration(configuration);
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  withStatus(status, updatedAt = new Date()) {
    assertServiceStatus(status);
    return new Service({ ...this, status, updatedAt });
  }

  withConfiguration(configuration, updatedAt = new Date()) {
    return new Service({ ...this, configuration, updatedAt });
  }
}
