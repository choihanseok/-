export const ServiceStatus = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  INACTIVE: 'INACTIVE',
});

const VALUES = new Set(Object.values(ServiceStatus));

export function assertServiceStatus(status) {
  if (!VALUES.has(status)) throw new TypeError('SERVICE_STATUS_INVALID');
  return status;
}
