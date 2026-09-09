export const AccountStatus = Object.freeze({
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  WITHDRAWN: 'WITHDRAWN',
});

const ACCOUNT_STATUS_VALUES = new Set(Object.values(AccountStatus));

export function isAccountStatus(value) {
  return ACCOUNT_STATUS_VALUES.has(value);
}

export function assertAccountStatus(value) {
  if (!isAccountStatus(value)) {
    throw new TypeError(`INVALID_ACCOUNT_STATUS: ${String(value)}`);
  }
}
