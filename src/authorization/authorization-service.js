import { assertRoleCode } from './role-code.js';
import { assertPermissionAction } from './permission-action.js';
import { PermissionScope, assertPermissionScope } from './permission-scope.js';

function same(a, b) { return a != null && b != null && a === b; }

export class AuthorizationService {
  constructor({ authorizationRepository, clock = () => new Date() }) {
    if (!authorizationRepository) throw new TypeError('AUTHORIZATION_REPOSITORY_REQUIRED');
    this.authorizationRepository = authorizationRepository;
    this.clock = clock;
  }

  async assignRole({ accountId, roleCode, serviceId = null, merchantId = null, distributorId = null, grantedBy = null }) {
    if (!accountId) throw new TypeError('ACCOUNT_ID_REQUIRED');
    assertRoleCode(roleCode);
    return this.authorizationRepository.saveAccountRole({
      accountId, roleCode, serviceId, merchantId, distributorId,
      status: 'ACTIVE', grantedAt: this.clock(), grantedBy,
    });
  }

  async grantPermission({ roleCode, permissionCode, action, scope }) {
    assertRoleCode(roleCode);
    if (!permissionCode) throw new TypeError('PERMISSION_CODE_REQUIRED');
    assertPermissionAction(action);
    assertPermissionScope(scope);
    return this.authorizationRepository.saveRolePermission({
      roleCode, permissionCode, action, scope, status: 'ACTIVE',
    });
  }

  async authorize({ accountId, permissionCode, action, resource = {} }) {
    if (!accountId) throw new TypeError('ACCOUNT_ID_REQUIRED');
    if (!permissionCode) throw new TypeError('PERMISSION_CODE_REQUIRED');
    assertPermissionAction(action);

    const assignments = await this.authorizationRepository.listRolesByAccount(accountId);
    for (const assignment of assignments) {
      const grants = await this.authorizationRepository.listPermissionsByRole(assignment.roleCode);
      for (const grant of grants) {
        if (grant.permissionCode !== permissionCode || grant.action !== action) continue;
        if (this.#scopeMatches({ accountId, assignment, scope: grant.scope, resource })) {
          return { allowed: true, roleCode: assignment.roleCode, scope: grant.scope };
        }
      }
    }
    return { allowed: false, reason: 'FORBIDDEN' };
  }

  async requirePermission(input) {
    const result = await this.authorize(input);
    if (!result.allowed) throw new Error('FORBIDDEN');
    return result;
  }

  #scopeMatches({ accountId, assignment, scope, resource }) {
    switch (scope) {
      case PermissionScope.SELF: return same(resource.ownerAccountId, accountId);
      case PermissionScope.ASSIGNED: return same(resource.assignedAccountId, accountId);
      case PermissionScope.MERCHANT: return same(resource.merchantId, assignment.merchantId);
      case PermissionScope.SERVICE: return same(resource.serviceId, assignment.serviceId);
      case PermissionScope.DISTRIBUTOR: return same(resource.distributorId, assignment.distributorId);
      case PermissionScope.PLATFORM: return true;
      case PermissionScope.SYSTEM: return assignment.roleCode === 'SUPER_ADMIN';
      default: return false;
    }
  }
}
