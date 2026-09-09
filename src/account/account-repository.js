export class AccountRepository {
  async findById(_accountId) {
    throw new Error('NOT_IMPLEMENTED');
  }

  async findByPhone(_phone) {
    throw new Error('NOT_IMPLEMENTED');
  }

  async save(_account) {
    throw new Error('NOT_IMPLEMENTED');
  }
}

export class InMemoryAccountRepository extends AccountRepository {
  #byId = new Map();
  #idByPhone = new Map();

  async findById(accountId) {
    return this.#byId.get(accountId) ?? null;
  }

  async findByPhone(phone) {
    const accountId = this.#idByPhone.get(phone);
    return accountId ? this.#byId.get(accountId) ?? null : null;
  }

  async save(account) {
    const existingId = this.#idByPhone.get(account.phone);
    if (existingId && existingId !== account.accountId) {
      throw new Error('ACCOUNT_PHONE_ALREADY_EXISTS');
    }

    const previous = this.#byId.get(account.accountId);
    if (previous && previous.phone !== account.phone) {
      this.#idByPhone.delete(previous.phone);
    }

    this.#byId.set(account.accountId, account);
    this.#idByPhone.set(account.phone, account.accountId);
    return account;
  }
}
