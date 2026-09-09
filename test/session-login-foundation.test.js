import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AccountService } from '../src/account/account-service.js';
import { SqliteAccountRepository } from '../src/account/sqlite-account-repository.js';
import { AuthChallenge } from '../src/auth/auth-challenge.js';
import { AuthChallengeStatus } from '../src/auth/auth-challenge-status.js';
import { SqliteAuthChallengeRepository } from '../src/auth/sqlite-auth-challenge-repository.js';
import { SqliteAuthSessionRepository } from '../src/auth/sqlite-auth-session-repository.js';
import { SessionService } from '../src/auth/session-service.js';
import { SessionStatus } from '../src/auth/session-status.js';

function migration(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

async function createContext({ purpose = 'LOGIN' } = {}) {
  const database = new DatabaseSync(':memory:');
  database.exec(migration('../migrations/001_create_accounts.sql'));
  database.exec(migration('../migrations/002_create_auth_challenges.sql'));
  database.exec(migration('../migrations/003_create_auth_sessions.sql'));

  const accountRepository = new SqliteAccountRepository({ database });
  const challengeRepository = new SqliteAuthChallengeRepository({ database });
  const sessionRepository = new SqliteAuthSessionRepository({ database });
  const accountService = new AccountService({
    accountRepository,
    idGenerator: () => 'account-session-1',
    clock: () => new Date('2026-09-09T11:00:00.000Z'),
  });
  const account = await accountService.createAccount({ phone: '01012345678' });
  const challenge = new AuthChallenge({
    challengeId: 'challenge-login-1',
    phone: account.phone,
    codeHash: 'hash-not-used-after-verification',
    purpose,
    status: AuthChallengeStatus.VERIFIED,
    expiresAt: new Date('2026-09-09T12:00:00.000Z'),
    createdAt: new Date('2026-09-09T10:59:00.000Z'),
    updatedAt: new Date('2026-09-09T11:00:00.000Z'),
  });
  await challengeRepository.save(challenge);

  let now = new Date('2026-09-09T11:01:00.000Z');
  let tokenSequence = 0;
  const sessionService = new SessionService({
    accountRepository,
    challengeRepository,
    sessionRepository,
    hashSecret: 'test-session-secret',
    idGenerator: () => 'session-1',
    tokenGenerator: () => `opaque-token-${++tokenSequence}`,
    clock: () => now,
    accessTtlMs: 60_000,
    refreshTtlMs: 300_000,
  });

  return { database, account, sessionRepository, sessionService, setNow: (value) => { now = value; } };
}

test('creates a DB-backed login session from a VERIFIED LOGIN challenge', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());

  const result = await ctx.sessionService.createSessionFromVerifiedChallenge({ challengeId: 'challenge-login-1' });
  assert.equal(result.accountId, ctx.account.accountId);
  assert.equal(result.accessToken, 'opaque-token-1');
  assert.equal(result.refreshToken, 'opaque-token-2');

  const stored = await ctx.sessionRepository.findById(result.sessionId);
  assert.equal(stored.status, SessionStatus.ACTIVE);
  assert.notEqual(stored.accessTokenHash, result.accessToken);
  assert.notEqual(stored.refreshTokenHash, result.refreshToken);
});

test('authenticates a valid access token', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  const issued = await ctx.sessionService.createSessionFromVerifiedChallenge({ challengeId: 'challenge-login-1' });
  const auth = await ctx.sessionService.authenticate({ accessToken: issued.accessToken });
  assert.equal(auth.accountId, ctx.account.accountId);
});

test('rejects a challenge whose purpose is not LOGIN', async (t) => {
  const ctx = await createContext({ purpose: 'SIGNUP' });
  t.after(() => ctx.database.close());
  await assert.rejects(
    () => ctx.sessionService.createSessionFromVerifiedChallenge({ challengeId: 'challenge-login-1' }),
    /AUTH_CHALLENGE_PURPOSE_INVALID/,
  );
});

test('rotates refresh token and invalidates the old refresh token', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  const issued = await ctx.sessionService.createSessionFromVerifiedChallenge({ challengeId: 'challenge-login-1' });
  const refreshed = await ctx.sessionService.refresh({ refreshToken: issued.refreshToken });
  assert.notEqual(refreshed.refreshToken, issued.refreshToken);
  assert.notEqual(refreshed.accessToken, issued.accessToken);
  await assert.rejects(() => ctx.sessionService.refresh({ refreshToken: issued.refreshToken }), /AUTH_SESSION_NOT_FOUND/);
});

test('revokes a session idempotently and blocks access authentication', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  const issued = await ctx.sessionService.createSessionFromVerifiedChallenge({ challengeId: 'challenge-login-1' });
  const revoked = await ctx.sessionService.revoke({ sessionId: issued.sessionId });
  assert.equal(revoked.status, SessionStatus.REVOKED);
  assert.equal((await ctx.sessionService.revoke({ sessionId: issued.sessionId })).status, SessionStatus.REVOKED);
  await assert.rejects(() => ctx.sessionService.authenticate({ accessToken: issued.accessToken }), /AUTH_SESSION_NOT_ACTIVE/);
});

test('expires access and refresh tokens at their separate boundaries', async (t) => {
  const ctx = await createContext();
  t.after(() => ctx.database.close());
  const issued = await ctx.sessionService.createSessionFromVerifiedChallenge({ challengeId: 'challenge-login-1' });

  ctx.setNow(new Date('2026-09-09T11:02:01.000Z'));
  await assert.rejects(() => ctx.sessionService.authenticate({ accessToken: issued.accessToken }), /AUTH_ACCESS_TOKEN_EXPIRED/);

  ctx.setNow(new Date('2026-09-09T11:06:01.000Z'));
  await assert.rejects(() => ctx.sessionService.refresh({ refreshToken: issued.refreshToken }), /AUTH_REFRESH_TOKEN_EXPIRED/);
  assert.equal((await ctx.sessionRepository.findById(issued.sessionId)).status, SessionStatus.EXPIRED);
});
