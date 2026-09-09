export class OrderRepository {
  async findById() { throw new Error('NOT_IMPLEMENTED'); }
  async list() { throw new Error('NOT_IMPLEMENTED'); }
  async save() { throw new Error('NOT_IMPLEMENTED'); }
  async saveWithStatusHistory() { throw new Error('NOT_IMPLEMENTED'); }
  async listStatusHistory() { throw new Error('NOT_IMPLEMENTED'); }
}

export class InMemoryOrderRepository extends OrderRepository {
  constructor() {
    super();
    this.orders = new Map();
    this.history = new Map();
  }

  async findById(orderId) { return this.orders.get(orderId) ?? null; }

  async list({ serviceId = null, customerAccountId = null, providerAccountId = null, merchantId = null, status = null } = {}) {
    return [...this.orders.values()].filter((order) =>
      (!serviceId || order.serviceId === serviceId) &&
      (!customerAccountId || order.customerAccountId === customerAccountId) &&
      (!providerAccountId || order.providerAccountId === providerAccountId) &&
      (!merchantId || order.merchantId === merchantId) &&
      (!status || order.status === status)
    );
  }

  async save(order) {
    this.orders.set(order.orderId, order);
    return order;
  }

  async saveWithStatusHistory(order, historyEntry) {
    this.orders.set(order.orderId, order);
    const rows = this.history.get(order.orderId) ?? [];
    rows.push({ ...historyEntry });
    this.history.set(order.orderId, rows);
    return order;
  }

  async listStatusHistory(orderId) {
    return [...(this.history.get(orderId) ?? [])];
  }
}
