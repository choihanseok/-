export class MatchingRepository {
  async findById() { throw new Error('NOT_IMPLEMENTED'); }
  async findLatestByOrderId() { throw new Error('NOT_IMPLEMENTED'); }
  async listByOrderId() { throw new Error('NOT_IMPLEMENTED'); }
  async save() { throw new Error('NOT_IMPLEMENTED'); }
}

export class InMemoryMatchingRepository extends MatchingRepository {
  constructor() {
    super();
    this.rows = new Map();
  }

  async findById(matchingId) {
    return this.rows.get(matchingId) ?? null;
  }

  async listByOrderId(orderId) {
    return [...this.rows.values()]
      .filter((row) => row.orderId === orderId)
      .sort((a, b) => a.attemptNo - b.attemptNo);
  }

  async findLatestByOrderId(orderId) {
    const rows = await this.listByOrderId(orderId);
    return rows.at(-1) ?? null;
  }

  async save(matching) {
    this.rows.set(matching.matchingId, matching);
    return matching;
  }
}
