import { AuthChallengeStatus, assertAuthChallengeStatus } from './auth-challenge-status.js';

export class AuthChallenge {
  constructor({
    challengeId,
    phone,
    codeHash,
    purpose,
    status = AuthChallengeStatus.PENDING,
    expiresAt,
    attemptCount = 0,
    createdAt = new Date(),
    updatedAt = new Date(),
  }) {
    if (!challengeId) throw new TypeError('AUTH_CHALLENGE_ID_REQUIRED');
    if (!phone) throw new TypeError('AUTH_PHONE_REQUIRED');
    if (!codeHash) throw new TypeError('AUTH_CODE_HASH_REQUIRED');
    if (!purpose) throw new TypeError('AUTH_PURPOSE_REQUIRED');
    if (!(expiresAt instanceof Date)) throw new TypeError('AUTH_EXPIRES_AT_REQUIRED');
    assertAuthChallengeStatus(status);

    this.challengeId = challengeId;
    this.phone = phone;
    this.codeHash = codeHash;
    this.purpose = purpose;
    this.status = status;
    this.expiresAt = expiresAt;
    this.attemptCount = attemptCount;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  isExpired(now = new Date()) {
    return now >= this.expiresAt;
  }

  withState({ status = this.status, attemptCount = this.attemptCount, updatedAt = new Date() }) {
    assertAuthChallengeStatus(status);
    return new AuthChallenge({ ...this, status, attemptCount, updatedAt });
  }
}
