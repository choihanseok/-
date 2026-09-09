import { AuthorizationRepository } from './authorization-repository.js';

export class SqliteAuthorizationRepository extends AuthorizationRepository {
  constructor({ database }) {
    super();
    if (!database) throw new TypeError('AUTHORIZATION_DATABASE_REQUIRED');
    this.database = database;
  }

  async listRolesByAccount(accountId) {
    return this.database.prepare(`
      SELECT account_id, role_code, service_id, merchant_id, distributor_id, status, granted_at, granted_by
      FROM account_roles
      WHERE account_id = ? AND status = 'ACTIVE'
    `).all(accountId).map((row) => ({
      accountId: row.account_id,
      roleCode: row.role_code,
      serviceId: row.service_id,
      merchantId: row.merchant_id,
      distributorId: row.distributor_id,
      status: row.status,
      grantedAt: new Date(row.granted_at),
      grantedBy: row.granted_by,
    }));
  }

  async saveAccountRole(assignment) {
    const updated = this.database.prepare(`
      UPDATE account_roles
      SET status = ?, granted_at = ?, granted_by = ?
      WHERE account_id = ? AND role_code = ?
        AND COALESCE(service_id, '') = COALESCE(?, '')
        AND COALESCE(merchant_id, '') = COALESCE(?, '')
        AND COALESCE(distributor_id, '') = COALESCE(?, '')
    `).run(
      assignment.status,
      assignment.grantedAt.toISOString(),
      assignment.grantedBy,
      assignment.accountId,
      assignment.roleCode,
      assignment.serviceId,
      assignment.merchantId,
      assignment.distributorId,
    );

    if (updated.changes === 0) {
      this.database.prepare(`
        INSERT INTO account_roles (
          account_id, role_code, service_id, merchant_id, distributor_id, status, granted_at, granted_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        assignment.accountId,
        assignment.roleCode,
        assignment.serviceId,
        assignment.merchantId,
        assignment.distributorId,
        assignment.status,
        assignment.grantedAt.toISOString(),
        assignment.grantedBy,
      );
    }
    return assignment;
  }

  async listPermissionsByRole(roleCode) {
    return this.database.prepare(`
      SELECT role_code, permission_code, action, scope, status
      FROM role_permissions
      WHERE role_code = ? AND status = 'ACTIVE'
    `).all(roleCode).map((row) => ({
      roleCode: row.role_code,
      permissionCode: row.permission_code,
      action: row.action,
      scope: row.scope,
      status: row.status,
    }));
  }

  async saveRolePermission(grant) {
    this.database.prepare(`
      INSERT INTO role_permissions (role_code, permission_code, action, scope, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(role_code, permission_code, action, scope)
      DO UPDATE SET status = excluded.status
    `).run(grant.roleCode, grant.permissionCode, grant.action, grant.scope, grant.status);
    return grant;
  }
}
