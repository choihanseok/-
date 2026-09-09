import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { AuthSession } from './auth-session.js';
import { AuthChallengeStatus } from './auth-challenge-status.js';
import { SessionStatus } from './session-status.js';

export class SessionService {
  constructor({
    accountRepository,
    challengeRepository,
    sessionRepository,
    hashSecret,
    idGenerator = randomUUID,
    tokenGenerator = () => randomBytes(32).toString('base64url'),
    clock = () => new Date(),
    accessTtlMs = 15 * 60 * 1000,
    refreshTtlMs = 30 * 24 * 60 * 60 * 1000,
    loginPurpose = 'LOGIN',
  }) {
    if (!accountRepository) throw new TypeError('AUTH_ACCOUNT_REPOSITORY_REQUIRED');
    if (!challengeRepository) throw new TypeError('AUTH_CHALLENGE_REPOSITORY_REQUIRED');
    if (!sessionRepository) throw new TypeError('AUTH_SESSION_REPOSITORY_REQUIRED');
    if (!hashSecret) throw new TypeError('AUTH_SESSION_HASH_SECRET_REQUIRED');
    this.accountRepository = accountRepository;
    this.challengeRepository = challengeRepository;
    this.sessionRepository = sessionRepository;
    this.hashSecret = hashSecret;
    this.idGenerator = idGenerator;
    this.tokenGenerator = tokenGenerator;
    this.clock = clock;
    this.accessTtlMs = accessTtlMs;
    this.refreshTtlMs = refreshTtlMs;
    this.loginPurpose = loginPurpose;
  }

  #hash(token) {
    return createHmac('sha256', this.hashSecret).update(token).digest('hex');
  }

  #issueTokens() {
    return { accessToken: this.tokenGenerator(), refreshToken: this.tokenGenerator() };
  }

  async createSessionFromVerifiedChallenge({ challengeId }) {
    if (!challengeId) throw new TypeError('AUTH_CHALLENGE_ID_REQUIRED');
    const challenge = await this.challengeRepository.findById(challengeId);
    if (!challenge) throw new Error('AUTH_CHALLENGE_NOT_FOUND');
    if (challenge.status !== AuthChallengeStatus.VERIFIED) throw new Error('AUTH_CHALLENGE_NOT_VERIFIED');
    if (challenge.purpose !== this.loginPurpose) throw new Error('AUTH_CHALLENGE_PURPOSE_INVALID');

    const account = await this.accountRepository.findByPhone(challenge.phone);
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');

    const now = this.clock();
    const { accessToken, refreshToken } = this.#issueTokens();
    const session = new AuthSession({
      sessionId: this.idGenerator(),
      accountId: account.accountId,
      accessTokenHash: this.#hash(accessToken),
      refreshTokenHash: this.#hash(refreshToken),
      accessExpiresAt: new Date(now.getTime() + this.accessTtlMs),
      refreshExpiresAt: new Date(now.getTime() + this.refreshTtlMs),
      createdAt: now,
      updatedAt: now,
    });
    await this.sessionRepository.save(session);
    return { sessionId: session.sessionId, accountId: account.accountId, accessToken, refreshToken, accessExpiresAt: session.accessExpiresAt, refreshExpiresAt: session.refreshExpiresAt };
  }

  async authenticate({ accessToken }) {
    if (!accessToken) throw new TypeError('AUTH_ACCESS_TOKEN_REQUIRED');
    const session = await this.sessionRepository.findByAccessTokenHash(this.#hash(accessToken));
    if (!session) throw new Error('AUTH_SESSION_NOT_FOUND');
    if (session.status !== SessionStatus.ACTIVE) throw new Error('AUTH_SESSION_NOT_ACTIVE');
    const now = this.clock();
    if (session.isAccessExpired(now)) throw new Error('AUTH_ACCESS_TOKEN_EXPIRED');
    return { sessionId: session.sessionId, accountId: session.accountId };
  }

  async refresh({ refreshToken }) {
    if (!refreshToken) throw new TypeError('AUTH_REFRESH_TOKEN_REQUIRED');
    const session = await this.sessionRepository.findByRefreshTokenHash(this.#hash(refreshToken));
    if (!session) throw new Error('AUTH_SESSION_NOT_FOUND');
    if (session.status !== SessionStatus.ACTIVE) throw new Error('AUTH_SESSION_NOT_ACTIVE');
    const now = this.clock();
    if (session.isRefreshExpired(now)) {
      await this.sessionRepository.save(session.withState({ status: SessionStatus.EXPIRED, updatedAt: now }));
      throw new Error('AUTH_REFRESH_TOKEN_EXPIRED');
    }

    const next = this.#issueTokens();
    const updated = session.withState({
      accessTokenHash: this.#hash(next.accessToken),
      refreshTokenHash: this.#hash(next.refreshToken),
      accessExpiresAt: new Date(now.getTime() + this.accessTtlMs),
      refreshExpiresAt: new Date(now.getTime() + this.refreshTtlMs),
      updatedAt: now,
    });
    await this.sessionRepository.save(updated);
    return { sessionId: updated.sessionId, accountId: updated.accountId, accessToken: next.accessToken, refreshToken: next.refreshToken, accessExpiresAt: updated.accessExpiresAt, refreshExpiresAt: updated.refreshExpiresAt };
  }

  async revoke({ sessionId }) {
    if (!sessionId) throw new TypeError('AUTH_SESSION_ID_REQUIRED');
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) throw new Error('AUTH_SESSION_NOT_FOUND');
    if (session.status === SessionStatus.REVOKED) return session;
    const now = this.clock();
    return this.sessionRepository.save(session.withState({ status: SessionStatus.REVOKED, revokedAt: now, updatedAt: now }));
  }
}
