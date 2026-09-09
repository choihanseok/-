import { randomUUID } from 'node:crypto';
import { Account } from './account.js';
import { AccountStatus, assertAccountStatus } from './account-status.js';

export class AccountService {
  constructor({ accountRepository, idGenerator = randomUUID, clock = () => new Date() }) {
    if (!accountRepository) throw new TypeError('ACCOUNT_REPOSITORY_REQUIRED');
    this.accountRepository = accountRepository;
    this.idGenerator = idGenerator;
    this.clock = clock;
  }

  async createAccount({ phone, email = null, name = null, status = AccountStatus.PENDING }) {
    if (!phone) throw new TypeError('ACCOUNT_PHONE_REQUIRED');
    assertAccountStatus(status);

    const existing = await this.accountRepository.findByPhone(phone);
    if (existing) throw new Error('ACCOUNT_PHONE_ALREADY_EXISTS');

    const now = this.clock();
    const account = new Account({
      accountId: this.idGenerator(),
      phone,
      email,
      name,
      status,
      createdAt: now,
      updatedAt: now,
    });

    return this.accountRepository.save(account);
  }

  async getAccount(accountId) {
    const account = await this.accountRepository.findById(accountId);
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');
    return account;
  }

  async changeStatus(accountId, status) {
    assertAccountStatus(status);
    const account = await this.getAccount(accountId);
    return this.accountRepository.save(account.withStatus(status, this.clock()));
  }
}
