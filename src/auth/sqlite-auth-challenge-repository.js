import { AuthChallenge } from './auth-challenge.js';
import { AuthChallengeRepository } from './auth-challenge-repository.js';

export class SqliteAuthChallengeRepository extends AuthChallengeRepository {
  constructor({ database }) {
    super();
    if (!database) throw new TypeError('AUTH_DATABASE_REQUIRED');
    this.database = database;
  }

  async findById(challengeId) {
    const row = this.database.prepare(`
      SELECT challenge_id, phone, code_hash, purpose, status, expires_at,
             attempt_count, created_at, updated_at
      FROM auth_challenges
      WHERE challenge_id = ?
    `).get(challengeId);

    return row ? this.#toEntity(row) : null;
  }

  async save(challenge) {
    this.database.prepare(`
      INSERT INTO auth_challenges (
        challenge_id, phone, code_hash, purpose, status, expires_at,
        attempt_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(challenge_id) DO UPDATE SET
        phone = excluded.phone,
        code_hash = excluded.code_hash,
        purpose = excluded.purpose,
        status = excluded.status,
        expires_at = excluded.expires_at,
        attempt_count = excluded.attempt_count,
        updated_at = excluded.updated_at
    `).run(
      challenge.challengeId,
      challenge.phone,
      challenge.codeHash,
      challenge.purpose,
      challenge.status,
      challenge.expiresAt.toISOString(),
      challenge.attemptCount,
      challenge.createdAt.toISOString(),
      challenge.updatedAt.toISOString(),
    );

    return this.findById(challenge.challengeId);
  }

  #toEntity(row) {
    return new AuthChallenge({
      challengeId: row.challenge_id,
      phone: row.phone,
      codeHash: row.code_hash,
      purpose: row.purpose,
      status: row.status,
      expiresAt: new Date(row.expires_at),
      attemptCount: row.attempt_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
