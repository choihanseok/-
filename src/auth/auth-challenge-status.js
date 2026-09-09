export const AuthChallengeStatus = Object.freeze({
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED',
});

export function assertAuthChallengeStatus(status) {
  if (!Object.values(AuthChallengeStatus).includes(status)) {
    throw new TypeError('AUTH_CHALLENGE_STATUS_INVALID');
  }
  return status;
}
