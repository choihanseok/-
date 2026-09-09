import { Matching } from './matching.js';
import { MatchingRepository } from './matching-repository.js';

export class SqliteMatchingRepository extends MatchingRepository {
  constructor({ database }) {
    super();
    if (!database) throw new TypeError('MATCHING_DATABASE_REQUIRED');
    this.database = database;
  }

  async findById(matchingId) {
    const row = this.database.prepare(`
      SELECT matching_id, order_id, service_id, provider_account_id, merchant_id, mode, status,
             attempt_no, reason, matched_at, responded_at, created_at, updated_at
      FROM matchings WHERE matching_id = ?
    `).get(matchingId);
    return row ? this.#toEntity(row) : null;
  }

  async listByOrderId(orderId) {
    return this.database.prepare(`
      SELECT matching_id, order_id, service_id, provider_account_id, merchant_id, mode, status,
             attempt_no, reason, matched_at, responded_at, created_at, updated_at
      FROM matchings WHERE order_id = ? ORDER BY attempt_no ASC
    `).all(orderId).map((row) => this.#toEntity(row));
  }

  async findLatestByOrderId(orderId) {
    const row = this.database.prepare(`
      SELECT matching_id, order_id, service_id, provider_account_id, merchant_id, mode, status,
             attempt_no, reason, matched_at, responded_at, created_at, updated_at
      FROM matchings WHERE order_id = ? ORDER BY attempt_no DESC LIMIT 1
    `).get(orderId);
    return row ? this.#toEntity(row) : null;
  }

  async save(matching) {
    this.database.prepare(`
      INSERT INTO matchings (
        matching_id, order_id, service_id, provider_account_id, merchant_id, mode, status,
        attempt_no, reason, matched_at, responded_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(matching_id) DO UPDATE SET
        provider_account_id = excluded.provider_account_id,
        merchant_id = excluded.merchant_id,
        mode = excluded.mode,
        status = excluded.status,
        reason = excluded.reason,
        matched_at = excluded.matched_at,
        responded_at = excluded.responded_at,
        updated_at = excluded.updated_at
    `).run(
      matching.matchingId,
      matching.orderId,
      matching.serviceId,
      matching.providerAccountId,
      matching.merchantId,
      matching.mode,
      matching.status,
      matching.attemptNo,
      matching.reason,
      matching.matchedAt?.toISOString() ?? null,
      matching.respondedAt?.toISOString() ?? null,
      matching.createdAt.toISOString(),
      matching.updatedAt.toISOString(),
    );
    return this.findById(matching.matchingId);
  }

  #toEntity(row) {
    return new Matching({
      matchingId: row.matching_id,
      orderId: row.order_id,
      serviceId: row.service_id,
      providerAccountId: row.provider_account_id,
      merchantId: row.merchant_id,
      mode: row.mode,
      status: row.status,
      attemptNo: row.attempt_no,
      reason: row.reason,
      matchedAt: row.matched_at,
      respondedAt: row.responded_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
