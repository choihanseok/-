import { AuthSession } from './auth-session.js';
import { AuthSessionRepository } from './auth-session-repository.js';

export class SqliteAuthSessionRepository extends AuthSessionRepository {
  constructor({ database }) {
    super();
    if (!database) throw new TypeError('AUTH_SESSION_DATABASE_REQUIRED');
    this.database = database;
  }

  async findById(sessionId) {
    return this.#findOne('session_id = ?', sessionId);
  }

  async findByAccessTokenHash(accessTokenHash) {
    return this.#findOne('access_token_hash = ?', accessTokenHash);
  }

  async findByRefreshTokenHash(refreshTokenHash) {
    return this.#findOne('refresh_token_hash = ?', refreshTokenHash);
  }

  async save(session) {
    this.database.prepare(`
      INSERT INTO auth_sessions (
        session_id, account_id, access_token_hash, refresh_token_hash, status,
        access_expires_at, refresh_expires_at, created_at, updated_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        access_token_hash = excluded.access_token_hash,
        refresh_token_hash = excluded.refresh_token_hash,
        status = excluded.status,
        access_expires_at = excluded.access_expires_at,
        refresh_expires_at = excluded.refresh_expires_at,
        updated_at = excluded.updated_at,
        revoked_at = excluded.revoked_at
    `).run(
      session.sessionId,
      session.accountId,
      session.accessTokenHash,
      session.refreshTokenHash,
      session.status,
      session.accessExpiresAt.toISOString(),
      session.refreshExpiresAt.toISOString(),
      session.createdAt.toISOString(),
      session.updatedAt.toISOString(),
      session.revokedAt ? session.revokedAt.toISOString() : null,
    );

    return this.findById(session.sessionId);
  }

  #findOne(where, value) {
    const row = this.database.prepare(`
      SELECT session_id, account_id, access_token_hash, refresh_token_hash, status,
             access_expires_at, refresh_expires_at, created_at, updated_at, revoked_at
      FROM auth_sessions
      WHERE ${where}
    `).get(value);

    return row ? this.#toEntity(row) : null;
  }

  #toEntity(row) {
    return new AuthSession({
      sessionId: row.session_id,
      accountId: row.account_id,
      accessTokenHash: row.access_token_hash,
      refreshTokenHash: row.refresh_token_hash,
      status: row.status,
      accessExpiresAt: new Date(row.access_expires_at),
      refreshExpiresAt: new Date(row.refresh_expires_at),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    });
  }
}
