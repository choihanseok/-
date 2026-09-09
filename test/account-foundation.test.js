import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountStatus } from '../src/account/account-status.js';
import { InMemoryAccountRepository } from '../src/account/account-repository.js';
import { AccountService } from '../src/account/account-service.js';

function createFixture() {
  let sequence = 0;
  const repository = new InMemoryAccountRepository();
  const service = new AccountService({
    accountRepository: repository,
    idGenerator: () => `account-${++sequence}`,
    clock: () => new Date('2026-09-09T10:00:00.000Z'),
  });
  return { repository, service };
}

test('creates an account with PENDING as the safe foundation default', async () => {
  const { service } = createFixture();

  const account = await service.createAccount({
    phone: '01000000001',
    name: '테스트고객',
  });

  assert.equal(account.accountId, 'account-1');
  assert.equal(account.phone, '01000000001');
  assert.equal(account.status, AccountStatus.PENDING);
});

test('rejects duplicate phone numbers', async () => {
  const { service } = createFixture();

  await service.createAccount({ phone: '01000000002' });

  await assert.rejects(
    () => service.createAccount({ phone: '01000000002' }),
    /ACCOUNT_PHONE_ALREADY_EXISTS/,
  );
});

test('loads an existing account', async () => {
  const { service } = createFixture();
  const created = await service.createAccount({ phone: '01000000003' });

  const loaded = await service.getAccount(created.accountId);

  assert.equal(loaded.accountId, created.accountId);
});

test('returns ACCOUNT_NOT_FOUND for a missing account', async () => {
  const { service } = createFixture();

  await assert.rejects(() => service.getAccount('missing'), /ACCOUNT_NOT_FOUND/);
});

test('changes account status through the service base', async () => {
  const { service } = createFixture();
  const created = await service.createAccount({ phone: '01000000004' });

  const updated = await service.changeStatus(created.accountId, AccountStatus.SUSPENDED);

  assert.equal(updated.status, AccountStatus.SUSPENDED);
});

test('rejects unknown account status', async () => {
  const { service } = createFixture();
  const created = await service.createAccount({ phone: '01000000005' });

  await assert.rejects(
    () => service.changeStatus(created.accountId, 'BROKEN_STATUS'),
    /INVALID_ACCOUNT_STATUS/,
  );
});
