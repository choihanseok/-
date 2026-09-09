export const OrderStatus = Object.freeze({
  DRAFT: 'DRAFT',
  REQUESTED: 'REQUESTED',
  RECEIVED: 'RECEIVED',
  SEARCHING: 'SEARCHING',
  ASSIGNED: 'ASSIGNED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCEL_REQUESTED: 'CANCEL_REQUESTED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
});

const VALUES = new Set(Object.values(OrderStatus));

export function assertOrderStatus(value) {
  if (!VALUES.has(value)) throw new TypeError('ORDER_STATUS_INVALID');
  return value;
}
