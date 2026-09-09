import { randomUUID } from 'node:crypto';
import { PermissionAction } from '../authorization/permission-action.js';
import { Order } from './order.js';
import { OrderStatus, assertOrderStatus } from './order-status.js';

export const OrderPermission = Object.freeze({
  VIEW: 'ORDER.VIEW',
  CREATE: 'ORDER.CREATE',
  CHANGE_STATUS: 'ORDER.CHANGE_STATUS',
  ASSIGN: 'ORDER.ASSIGN',
});

const TRANSITIONS = Object.freeze({
  [OrderStatus.DRAFT]: new Set([OrderStatus.REQUESTED, OrderStatus.CANCELLED]),
  [OrderStatus.REQUESTED]: new Set([OrderStatus.RECEIVED, OrderStatus.SEARCHING, OrderStatus.CANCEL_REQUESTED, OrderStatus.CANCELLED, OrderStatus.FAILED]),
  [OrderStatus.RECEIVED]: new Set([OrderStatus.SEARCHING, OrderStatus.ASSIGNED, OrderStatus.CANCEL_REQUESTED, OrderStatus.CANCELLED, OrderStatus.FAILED]),
  [OrderStatus.SEARCHING]: new Set([OrderStatus.ASSIGNED, OrderStatus.CANCEL_REQUESTED, OrderStatus.CANCELLED, OrderStatus.FAILED]),
  [OrderStatus.ASSIGNED]: new Set([OrderStatus.ACCEPTED, OrderStatus.SEARCHING, OrderStatus.CANCEL_REQUESTED, OrderStatus.CANCELLED, OrderStatus.FAILED]),
  [OrderStatus.ACCEPTED]: new Set([OrderStatus.IN_PROGRESS, OrderStatus.CANCEL_REQUESTED, OrderStatus.CANCELLED, OrderStatus.FAILED]),
  [OrderStatus.IN_PROGRESS]: new Set([OrderStatus.COMPLETED, OrderStatus.CANCEL_REQUESTED, OrderStatus.CANCELLED, OrderStatus.FAILED]),
  [OrderStatus.CANCEL_REQUESTED]: new Set([OrderStatus.CANCELLED, OrderStatus.IN_PROGRESS]),
  [OrderStatus.COMPLETED]: new Set(),
  [OrderStatus.CANCELLED]: new Set(),
  [OrderStatus.FAILED]: new Set(),
});

export class OrderService {
  constructor({
    orderRepository,
    serviceRepository,
    locationRepository = null,
    authorizationService = null,
    idGenerator = randomUUID,
    historyIdGenerator = randomUUID,
    clock = () => new Date(),
  }) {
    if (!orderRepository) throw new TypeError('ORDER_REPOSITORY_REQUIRED');
    if (!serviceRepository) throw new TypeError('SERVICE_REPOSITORY_REQUIRED');
    this.orderRepository = orderRepository;
    this.serviceRepository = serviceRepository;
    this.locationRepository = locationRepository;
    this.authorizationService = authorizationService;
    this.idGenerator = idGenerator;
    this.historyIdGenerator = historyIdGenerator;
    this.clock = clock;
  }

  async #require(actorAccountId, permissionCode, action, resource) {
    if (!this.authorizationService) return null;
    if (!actorAccountId) throw new TypeError('ACTOR_ACCOUNT_ID_REQUIRED');
    return this.authorizationService.requirePermission({ accountId: actorAccountId, permissionCode, action, resource });
  }

  #resource(order) {
    return {
      ownerAccountId: order.customerAccountId,
      assignedAccountId: order.providerAccountId,
      merchantId: order.merchantId,
      serviceId: order.serviceId,
    };
  }

  async #resolveService(serviceId, serviceCode) {
    const service = serviceId
      ? await this.serviceRepository.findById(serviceId)
      : await this.serviceRepository.findByCode(serviceCode);
    if (!service) throw new Error('ORDER_SERVICE_NOT_FOUND');
    if (serviceCode && service.serviceCode !== serviceCode) throw new Error('ORDER_SERVICE_MISMATCH');
    return service;
  }

  async createOrder({
    actorAccountId = null,
    orderId = this.idGenerator(),
    serviceId = null,
    serviceCode = null,
    customerAccountId,
    scheduledAt = null,
    metadata = {},
  }) {
    if (!customerAccountId) throw new TypeError('ORDER_CUSTOMER_ACCOUNT_ID_REQUIRED');
    const service = await this.#resolveService(serviceId, serviceCode);
    const now = this.clock();
    const order = new Order({
      orderId,
      serviceId: service.serviceId,
      serviceCode: service.serviceCode,
      customerAccountId,
      status: OrderStatus.DRAFT,
      scheduledAt,
      metadata,
      createdAt: now,
      updatedAt: now,
    });
    await this.#require(actorAccountId, OrderPermission.CREATE, PermissionAction.CREATE, this.#resource(order));
    if (await this.orderRepository.findById(order.orderId)) throw new Error('ORDER_ALREADY_EXISTS');
    return this.orderRepository.saveWithStatusHistory(order, {
      historyId: this.historyIdGenerator(),
      orderId: order.orderId,
      fromStatus: null,
      toStatus: OrderStatus.DRAFT,
      actorAccountId,
      reason: 'ORDER_CREATED',
      createdAt: now,
    });
  }

  async getOrder(orderId, { actorAccountId = null } = {}) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new Error('ORDER_NOT_FOUND');
    await this.#require(actorAccountId, OrderPermission.VIEW, PermissionAction.VIEW, this.#resource(order));
    return order;
  }

  async listOrders(filter = {}, { actorAccountId = null } = {}) {
    const rows = await this.orderRepository.list(filter);
    if (!this.authorizationService) return rows;
    const allowed = [];
    for (const order of rows) {
      const result = await this.authorizationService.authorize({
        accountId: actorAccountId,
        permissionCode: OrderPermission.VIEW,
        action: PermissionAction.VIEW,
        resource: this.#resource(order),
      });
      if (result.allowed) allowed.push(order);
    }
    return allowed;
  }

  async changeStatus(orderId, toStatus, { actorAccountId = null, reason = null } = {}) {
    assertOrderStatus(toStatus);
    const current = await this.orderRepository.findById(orderId);
    if (!current) throw new Error('ORDER_NOT_FOUND');
    if (current.status === toStatus) return current;
    if (!TRANSITIONS[current.status]?.has(toStatus)) throw new Error('ORDER_STATUS_TRANSITION_INVALID');
    await this.#require(actorAccountId, OrderPermission.CHANGE_STATUS, PermissionAction.UPDATE, this.#resource(current));
    const now = this.clock();
    const next = current.withStatus(toStatus, now);
    return this.orderRepository.saveWithStatusHistory(next, {
      historyId: this.historyIdGenerator(),
      orderId,
      fromStatus: current.status,
      toStatus,
      actorAccountId,
      reason,
      createdAt: now,
    });
  }

  async assignProvider(orderId, providerAccountId, { actorAccountId = null, reason = null } = {}) {
    if (!providerAccountId) throw new TypeError('ORDER_PROVIDER_ACCOUNT_ID_REQUIRED');
    const current = await this.orderRepository.findById(orderId);
    if (!current) throw new Error('ORDER_NOT_FOUND');
    await this.#require(actorAccountId, OrderPermission.ASSIGN, PermissionAction.ASSIGN, this.#resource(current));
    const now = this.clock();
    const next = new Order({ ...current, providerAccountId, updatedAt: now });
    await this.orderRepository.save(next);
    return next;
  }

  async listStatusHistory(orderId, { actorAccountId = null } = {}) {
    await this.getOrder(orderId, { actorAccountId });
    return this.orderRepository.listStatusHistory(orderId);
  }

  async listOrderLocations(orderId, { actorAccountId = null } = {}) {
    await this.getOrder(orderId, { actorAccountId });
    if (!this.locationRepository) return [];
    return this.locationRepository.list({ referenceType: 'ORDER', referenceId: orderId });
  }
}
