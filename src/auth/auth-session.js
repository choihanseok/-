import { SessionStatus, assertSessionStatus } from './session-status.js';

export class AuthSession {
  constructor({
    sessionId,
    accountId,
    accessTokenHash,
    refreshTokenHash,
    status = SessionStatus.ACTIVE,
    accessExpiresAt,
    refreshExpiresAt,
    createdAt = new Date(),
    updatedAt = new Date(),
    revokedAt = null,
  }) {
    if (!sessionId) throw new TypeError('AUTH_SESSION_ID_REQUIRED');
    if (!accountId) throw new TypeError('AUTH_SESSION_ACCOUNT_ID_REQUIRED');
    if (!accessTokenHash) throw new TypeError('AUTH_ACCESS_TOKEN_HASH_REQUIRED');
    if (!refreshTokenHash) throw new TypeError('AUTH_REFRESH_TOKEN_HASH_REQUIRED');
    if (!(accessExpiresAt instanceof Date)) throw new TypeError('AUTH_ACCESS_EXPIRES_AT_REQUIRED');
    if (!(refreshExpiresAt instanceof Date)) throw new TypeError('AUTH_REFRESH_EXPIRES_AT_REQUIRED');
    assertSessionStatus(status);

    this.sessionId = sessionId;
    this.accountId = accountId;
    this.accessTokenHash = accessTokenHash;
    this.refreshTokenHash = refreshTokenHash;
    this.status = status;
    this.accessExpiresAt = accessExpiresAt;
    this.refreshExpiresAt = refreshExpiresAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.revokedAt = revokedAt;
  }

  isAccessExpired(now = new Date()) {
    return now >= this.accessExpiresAt;
  }

  isRefreshExpired(now = new Date()) {
    return now >= this.refreshExpiresAt;
  }

  withState({
    accessTokenHash = this.accessTokenHash,
    refreshTokenHash = this.refreshTokenHash,
    status = this.status,
    accessExpiresAt = this.accessExpiresAt,
    refreshExpiresAt = this.refreshExpiresAt,
    updatedAt = new Date(),
    revokedAt = this.revokedAt,
  }) {
    return new AuthSession({
      ...this,
      accessTokenHash,
      refreshTokenHash,
      status,
      accessExpiresAt,
      refreshExpiresAt,
      updatedAt,
      revokedAt,
    });
  }
}
