import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AccountService } from '../src/account/account-service.js';
import { AccountStatus } from '../src/account/account-status.js';
import { SqliteAccountRepository } from '../src/account/sqlite-account-repository.js';

function createContext() {
  const database = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../migrations/001_create_accounts.sql', import.meta.url), 'utf8');
  database.exec(migration);

  const repository = new SqliteAccountRepository({ database });
  let idSequence = 0;
  let clockSequence = 0;
  const service = new AccountService({
    accountRepository: repository,
    idGenerator: () => `account-db-${++idSequence}`,
    clock: () => new Date(`2026-09-09T10:0${clockSequence++}:00.000Z`),
  });

  return { database, repository, service };
}

test('AccountService stores and retrieves account through SQLite repository', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());

  const created = await service.createAccount({
    phone: '01012345678',
    email: 'db@example.com',
    name: 'DB Test',
  });

  assert.equal(created.accountId, 'account-db-1');
  assert.equal(created.status, AccountStatus.PENDING);

  const found = await service.getAccount(created.accountId);
  assert.equal(found.phone, '01012345678');
  assert.equal(found.email, 'db@example.com');
  assert.equal(found.name, 'DB Test');
});

test('SQLite repository persists status changes', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());

  const created = await service.createAccount({ phone: '01022223333' });
  const changed = await service.changeStatus(created.accountId, AccountStatus.ACTIVE);

  assert.equal(changed.status, AccountStatus.ACTIVE);
  assert.equal((await service.getAccount(created.accountId)).status, AccountStatus.ACTIVE);
});

test('SQLite UNIQUE constraint and repository guard prevent duplicate phone', async (t) => {
  const { database, service } = createContext();
  t.after(() => database.close());

  await service.createAccount({ phone: '01099998888' });

  await assert.rejects(
    () => service.createAccount({ phone: '01099998888' }),
    /ACCOUNT_PHONE_ALREADY_EXISTS/,
  );
});

test('SQLite migration enforces valid AccountStatus values at DB boundary', async (t) => {
  const { database } = createContext();
  t.after(() => database.close());

  assert.throws(
    () => database.prepare(`
      INSERT INTO accounts (account_id, phone, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('invalid-status', '01000000000', 'BROKEN', new Date().toISOString(), new Date().toISOString()),
    /CHECK constraint failed/,
  );
});
