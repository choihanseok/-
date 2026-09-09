export const PermissionAction = Object.freeze({
  VIEW: 'VIEW',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
  ASSIGN: 'ASSIGN',
  CANCEL: 'CANCEL',
  REFUND: 'REFUND',
  SETTLE: 'SETTLE',
  EXPORT: 'EXPORT',
  MANAGE: 'MANAGE',
});

const VALUES = new Set(Object.values(PermissionAction));

export function assertPermissionAction(value) {
  if (!VALUES.has(value)) throw new TypeError('PERMISSION_ACTION_INVALID');
  return value;
}
