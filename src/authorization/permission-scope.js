export const PermissionScope = Object.freeze({
  SELF: 'SELF',
  ASSIGNED: 'ASSIGNED',
  MERCHANT: 'MERCHANT',
  SERVICE: 'SERVICE',
  DISTRIBUTOR: 'DISTRIBUTOR',
  PLATFORM: 'PLATFORM',
  SYSTEM: 'SYSTEM',
});

const VALUES = new Set(Object.values(PermissionScope));

export function assertPermissionScope(value) {
  if (!VALUES.has(value)) throw new TypeError('PERMISSION_SCOPE_INVALID');
  return value;
}
