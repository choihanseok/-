export const SessionStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
});

export function assertSessionStatus(status) {
  if (!Object.values(SessionStatus).includes(status)) {
    throw new TypeError('AUTH_SESSION_STATUS_INVALID');
  }
  return status;
}
