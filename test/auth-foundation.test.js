import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AuthChallengeStatus } from '../src/auth/auth-challenge-status.js';
import { PhoneVerificationService } from '../src/auth/phone-verification-service.js';
import { SqliteAuthChallengeRepository } from '../src/auth/sqlite-auth-challenge-repository.js';

class FakeCodeSender {
  sent = [];
  async send(payload) { this.sent.push(payload); }
}

function createContext({ now = '2026-09-09T10:00:00.000Z', code = '123456', maxAttempts = 3 } = {}) {
  const database = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../migrations/002_create_auth_challenges.sql', import.meta.url), 'utf8');
  database.exec(migration);
  const repository = new SqliteAuthChallengeRepository({ database });
  const sender = new FakeCodeSender();
  let current = new Date(now);
  const service = new PhoneVerificationService({
    challengeRepository: repository,
    codeSender: sender,
    hashSecret: 'test-only-secret',
    idGenerator: () => 'challenge-1',
    clock: () => new Date(current),
    codeGenerator: () => code,
    maxAttempts,
  });
  return {
    database,
    repository,
    sender,
    service,
    advanceMs(ms) { current = new Date(current.getTime() + ms); },
  };
}

test('requests phone verification without storing raw code', async (t) => {
  const { database, repository, sender, service } = createContext();
  t.after(() => database.close());

  const result = await service.requestVerification({ phone: '01012345678', purpose: 'SIGNUP' });
  assert.equal(result.challengeId, 'challenge-1');
  assert.equal(sender.sent.length, 1);
  assert.equal(sender.sent[0].code, '123456');

  const stored = await repository.findById('challenge-1');
  assert.equal(stored.status, AuthChallengeStatus.PENDING);
  assert.notEqual(stored.codeHash, '123456');
});

test('verifies correct code and persists VERIFIED status', async (t) => {
  const { database, repository, service } = createContext();
  t.after(() => database.close());
  await service.requestVerification({ phone: '01012345678', purpose: 'SIGNUP' });

  const verified = await service.verify({ challengeId: 'challenge-1', code: '123456' });
  assert.equal(verified.status, AuthChallengeStatus.VERIFIED);
  assert.equal((await repository.findById('challenge-1')).status, AuthChallengeStatus.VERIFIED);
});

test('rejects invalid code and tracks attempts', async (t) => {
  const { database, repository, service } = createContext();
  t.after(() => database.close());
  await service.requestVerification({ phone: '01012345678', purpose: 'LOGIN' });

  await assert.rejects(() => service.verify({ challengeId: 'challenge-1', code: '000000' }), /AUTH_CODE_INVALID/);
  assert.equal((await repository.findById('challenge-1')).attemptCount, 1);
});

test('locks challenge after max invalid attempts', async (t) => {
  const { database, repository, service } = createContext({ maxAttempts: 2 });
  t.after(() => database.close());
  await service.requestVerification({ phone: '01012345678', purpose: 'LOGIN' });

  await assert.rejects(() => service.verify({ challengeId: 'challenge-1', code: '000000' }), /AUTH_CODE_INVALID/);
  await assert.rejects(() => service.verify({ challengeId: 'challenge-1', code: '111111' }), /AUTH_CHALLENGE_ATTEMPTS_EXCEEDED/);
  assert.equal((await repository.findById('challenge-1')).status, AuthChallengeStatus.FAILED);
});

test('expires challenge after TTL', async (t) => {
  const { database, repository, service, advanceMs } = createContext();
  t.after(() => database.close());
  await service.requestVerification({ phone: '01012345678', purpose: 'SIGNUP' });
  advanceMs(5 * 60 * 1000);

  await assert.rejects(() => service.verify({ challengeId: 'challenge-1', code: '123456' }), /AUTH_CHALLENGE_EXPIRED/);
  assert.equal((await repository.findById('challenge-1')).status, AuthChallengeStatus.EXPIRED);
});

test('verified challenge is idempotent on repeated verification', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());
  await service.requestVerification({ phone: '01012345678', purpose: 'SIGNUP' });
  await service.verify({ challengeId: 'challenge-1', code: '123456' });

  const repeated = await service.verify({ challengeId: 'challenge-1', code: 'anything' });
  assert.equal(repeated.status, AuthChallengeStatus.VERIFIED);
});
