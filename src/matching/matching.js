import { MatchingMode, assertMatchingMode } from './matching-mode.js';
import { MatchingStatus, assertMatchingStatus } from './matching-status.js';

export class Matching {
  constructor({
    matchingId,
    orderId,
    serviceId,
    providerAccountId = null,
    merchantId = null,
    mode = MatchingMode.MANUAL_ADMIN,
    status = MatchingStatus.REQUESTED,
    attemptNo = 1,
    reason = null,
    matchedAt = null,
    respondedAt = null,
    createdAt = new Date(),
    updatedAt = new Date(),
  }) {
    if (!matchingId) throw new TypeError('MATCHING_ID_REQUIRED');
    if (!orderId) throw new TypeError('MATCHING_ORDER_ID_REQUIRED');
    if (!serviceId) throw new TypeError('MATCHING_SERVICE_ID_REQUIRED');
    assertMatchingMode(mode);
    assertMatchingStatus(status);
    if (!Number.isInteger(attemptNo) || attemptNo < 1) throw new TypeError('MATCHING_ATTEMPT_INVALID');

    this.matchingId = matchingId;
    this.orderId = orderId;
    this.serviceId = serviceId;
    this.providerAccountId = providerAccountId;
    this.merchantId = merchantId;
    this.mode = mode;
    this.status = status;
    this.attemptNo = attemptNo;
    this.reason = reason;
    this.matchedAt = matchedAt ? new Date(matchedAt) : null;
    this.respondedAt = respondedAt ? new Date(respondedAt) : null;
    this.createdAt = new Date(createdAt);
    this.updatedAt = new Date(updatedAt);
  }

  withState(status, { reason = this.reason, matchedAt = this.matchedAt, respondedAt = this.respondedAt, updatedAt = new Date() } = {}) {
    return new Matching({ ...this, status, reason, matchedAt, respondedAt, updatedAt });
  }
}
