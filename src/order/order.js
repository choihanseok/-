import { OrderStatus, assertOrderStatus } from './order-status.js';

export class Order {
  constructor({
    orderId,
    serviceId,
    serviceCode,
    customerAccountId,
    providerAccountId = null,
    merchantId = null,
    status = OrderStatus.DRAFT,
    scheduledAt = null,
    requestedAt = null,
    completedAt = null,
    cancelledAt = null,
    metadata = {},
    createdAt = new Date(),
    updatedAt = new Date(),
  }) {
    if (!orderId) throw new TypeError('ORDER_ID_REQUIRED');
    if (!serviceId) throw new TypeError('ORDER_SERVICE_ID_REQUIRED');
    if (!serviceCode) throw new TypeError('ORDER_SERVICE_CODE_REQUIRED');
    if (!customerAccountId) throw new TypeError('ORDER_CUSTOMER_ACCOUNT_ID_REQUIRED');
    assertOrderStatus(status);
    if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) throw new TypeError('ORDER_METADATA_INVALID');

    this.orderId = orderId;
    this.serviceId = serviceId;
    this.serviceCode = serviceCode;
    this.customerAccountId = customerAccountId;
    this.providerAccountId = providerAccountId;
    this.merchantId = merchantId;
    this.status = status;
    this.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    this.requestedAt = requestedAt ? new Date(requestedAt) : null;
    this.completedAt = completedAt ? new Date(completedAt) : null;
    this.cancelledAt = cancelledAt ? new Date(cancelledAt) : null;
    this.metadata = structuredClone(metadata);
    this.createdAt = new Date(createdAt);
    this.updatedAt = new Date(updatedAt);
  }

  withStatus(status, updatedAt = new Date()) {
    assertOrderStatus(status);
    const next = new Order({ ...this, status, updatedAt });
    if (status === OrderStatus.REQUESTED && !next.requestedAt) next.requestedAt = new Date(updatedAt);
    if (status === OrderStatus.COMPLETED) next.completedAt = new Date(updatedAt);
    if (status === OrderStatus.CANCELLED) next.cancelledAt = new Date(updatedAt);
    return next;
  }
}
