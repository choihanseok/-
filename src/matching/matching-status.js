export const MatchingStatus = Object.freeze({
  REQUESTED: 'REQUESTED',
  OFFERED: 'OFFERED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  REASSIGNED: 'REASSIGNED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
});

const values = new Set(Object.values(MatchingStatus));

export function assertMatchingStatus(status) {
  if (!values.has(status)) throw new TypeError('MATCHING_STATUS_INVALID');
  return status;
}
