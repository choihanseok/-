import { Order } from './order.js';
import { OrderRepository } from './order-repository.js';

function iso(value) { return value ? new Date(value).toISOString() : null; }

export class SqliteOrderRepository extends OrderRepository {
  constructor({ database }) {
    super();
    if (!database) throw new TypeError('ORDER_DATABASE_REQUIRED');
    this.database = database;
  }

  async findById(orderId) {
    const row = this.database.prepare(`
      SELECT * FROM orders WHERE order_id = ?
    `).get(orderId);
    return row ? this.#toEntity(row) : null;
  }

  async list({ serviceId = null, customerAccountId = null, providerAccountId = null, merchantId = null, status = null } = {}) {
    const clauses = [];
    const values = [];
    for (const [column, value] of [
      ['service_id', serviceId],
      ['customer_account_id', customerAccountId],
      ['provider_account_id', providerAccountId],
      ['merchant_id', merchantId],
      ['status', status],
    ]) {
      if (value != null) { clauses.push(`${column} = ?`); values.push(value); }
    }
    const sql = `SELECT * FROM orders${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at ASC`;
    return this.database.prepare(sql).all(...values).map((row) => this.#toEntity(row));
  }

  async save(order) {
    this.database.prepare(`
      INSERT INTO orders(
        order_id, service_id, service_code, customer_account_id, provider_account_id, merchant_id,
        status, scheduled_at, requested_at, completed_at, cancelled_at, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        service_id = excluded.service_id,
        service_code = excluded.service_code,
        customer_account_id = excluded.customer_account_id,
        provider_account_id = excluded.provider_account_id,
        merchant_id = excluded.merchant_id,
        status = excluded.status,
        scheduled_at = excluded.scheduled_at,
        requested_at = excluded.requested_at,
        completed_at = excluded.completed_at,
        cancelled_at = excluded.cancelled_at,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      order.orderId, order.serviceId, order.serviceCode, order.customerAccountId, order.providerAccountId, order.merchantId,
      order.status, iso(order.scheduledAt), iso(order.requestedAt), iso(order.completedAt), iso(order.cancelledAt),
      JSON.stringify(order.metadata ?? {}), iso(order.createdAt), iso(order.updatedAt),
    );
    return this.findById(order.orderId);
  }

  async saveWithStatusHistory(order, historyEntry) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      await this.save(order);
      this.database.prepare(`
        INSERT INTO order_status_histories(history_id, order_id, from_status, to_status, actor_account_id, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyEntry.historyId,
        order.orderId,
        historyEntry.fromStatus ?? null,
        historyEntry.toStatus,
        historyEntry.actorAccountId ?? null,
        historyEntry.reason ?? null,
        iso(historyEntry.createdAt),
      );
      this.database.exec('COMMIT');
      return this.findById(order.orderId);
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  async listStatusHistory(orderId) {
    return this.database.prepare(`
      SELECT history_id, order_id, from_status, to_status, actor_account_id, reason, created_at
      FROM order_status_histories WHERE order_id = ? ORDER BY created_at ASC, history_id ASC
    `).all(orderId).map((row) => ({
      historyId: row.history_id,
      orderId: row.order_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      actorAccountId: row.actor_account_id,
      reason: row.reason,
      createdAt: new Date(row.created_at),
    }));
  }

  #toEntity(row) {
    return new Order({
      orderId: row.order_id,
      serviceId: row.service_id,
      serviceCode: row.service_code,
      customerAccountId: row.customer_account_id,
      providerAccountId: row.provider_account_id,
      merchantId: row.merchant_id,
      status: row.status,
      scheduledAt: row.scheduled_at,
      requestedAt: row.requested_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
      metadata: JSON.parse(row.metadata_json || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
