export const RoleCode = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  PROVIDER: 'PROVIDER',
  MERCHANT: 'MERCHANT',
  SERVICE_ADMIN: 'SERVICE_ADMIN',
  DISTRIBUTOR: 'DISTRIBUTOR',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
});

const VALUES = new Set(Object.values(RoleCode));

export function assertRoleCode(value) {
  if (!VALUES.has(value)) throw new TypeError('ROLE_CODE_INVALID');
  return value;
}
