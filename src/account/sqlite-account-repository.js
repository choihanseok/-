import { Account } from './account.js';
import { AccountRepository } from './account-repository.js';

export class SqliteAccountRepository extends AccountRepository {
  constructor({ database }) {
    super();
    if (!database) throw new TypeError('ACCOUNT_DATABASE_REQUIRED');
    this.database = database;
  }

  async findById(accountId) {
    const row = this.database.prepare(`
      SELECT account_id, phone, email, name, status, created_at, updated_at
      FROM accounts
      WHERE account_id = ?
    `).get(accountId);

    return row ? this.#toEntity(row) : null;
  }

  async findByPhone(phone) {
    const row = this.database.prepare(`
      SELECT account_id, phone, email, name, status, created_at, updated_at
      FROM accounts
      WHERE phone = ?
    `).get(phone);

    return row ? this.#toEntity(row) : null;
  }

  async save(account) {
    const duplicate = this.database.prepare(`
      SELECT account_id
      FROM accounts
      WHERE phone = ? AND account_id <> ?
    `).get(account.phone, account.accountId);

    if (duplicate) {
      throw new Error('ACCOUNT_PHONE_ALREADY_EXISTS');
    }

    this.database.prepare(`
      INSERT INTO accounts (
        account_id, phone, email, name, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        phone = excluded.phone,
        email = excluded.email,
        name = excluded.name,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      account.accountId,
      account.phone,
      account.email,
      account.name,
      account.status,
      account.createdAt.toISOString(),
      account.updatedAt.toISOString(),
    );

    return this.findById(account.accountId);
  }

  #toEntity(row) {
    return new Account({
      accountId: row.account_id,
      phone: row.phone,
      email: row.email,
      name: row.name,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
