export class AuthorizationRepository {
  async listRolesByAccount(_accountId) { throw new Error('NOT_IMPLEMENTED'); }
  async saveAccountRole(_assignment) { throw new Error('NOT_IMPLEMENTED'); }
  async listPermissionsByRole(_roleCode) { throw new Error('NOT_IMPLEMENTED'); }
  async saveRolePermission(_grant) { throw new Error('NOT_IMPLEMENTED'); }
}

export class InMemoryAuthorizationRepository extends AuthorizationRepository {
  #accountRoles = [];
  #rolePermissions = [];

  async listRolesByAccount(accountId) {
    return this.#accountRoles.filter((item) => item.accountId === accountId && item.status === 'ACTIVE');
  }

  async saveAccountRole(assignment) {
    const index = this.#accountRoles.findIndex((item) =>
      item.accountId === assignment.accountId && item.roleCode === assignment.roleCode &&
      (item.serviceId ?? null) === (assignment.serviceId ?? null) &&
      (item.merchantId ?? null) === (assignment.merchantId ?? null) &&
      (item.distributorId ?? null) === (assignment.distributorId ?? null));
    if (index >= 0) this.#accountRoles[index] = assignment;
    else this.#accountRoles.push(assignment);
    return assignment;
  }

  async listPermissionsByRole(roleCode) {
    return this.#rolePermissions.filter((item) => item.roleCode === roleCode && item.status === 'ACTIVE');
  }

  async saveRolePermission(grant) {
    const index = this.#rolePermissions.findIndex((item) =>
      item.roleCode === grant.roleCode && item.permissionCode === grant.permissionCode &&
      item.action === grant.action && item.scope === grant.scope);
    if (index >= 0) this.#rolePermissions[index] = grant;
    else this.#rolePermissions.push(grant);
    return grant;
  }
}
