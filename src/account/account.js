import { AccountStatus, assertAccountStatus } from './account-status.js';

export class Account {
  constructor({
    accountId,
    phone,
    email = null,
    name = null,
    status = AccountStatus.PENDING,
    createdAt = new Date(),
    updatedAt = new Date(),
  }) {
    if (!accountId) throw new TypeError('ACCOUNT_ID_REQUIRED');
    if (!phone) throw new TypeError('ACCOUNT_PHONE_REQUIRED');
    assertAccountStatus(status);

    this.accountId = accountId;
    this.phone = phone;
    this.email = email;
    this.name = name;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  withStatus(status, updatedAt = new Date()) {
    assertAccountStatus(status);
    return new Account({
      ...this,
      status,
      updatedAt,
    });
  }
}
