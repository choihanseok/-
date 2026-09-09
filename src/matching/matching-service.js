import { randomUUID } from 'node:crypto';
import { PermissionAction } from '../authorization/permission-action.js';
import { Order } from '../order/order.js';
import { OrderStatus } from '../order/order-status.js';
import { Matching } from './matching.js';
import { MatchingMode } from './matching-mode.js';
import { MatchingStatus } from './matching-status.js';

export const MatchingPermission = Object.freeze({
  VIEW: 'MATCHING.VIEW',
  ASSIGN: 'MATCHING.ASSIGN',
  RESPOND: 'MATCHING.RESPOND',
});

export class MatchingService {
  constructor({
    matchingRepository,
    orderRepository,
    authorizationService = null,
    idGenerator = randomUUID,
    historyIdGenerator = randomUUID,
    clock = () => new Date(),
  }) {
    if (!matchingRepository) throw new TypeError('MATCHING_REPOSITORY_REQUIRED');
    if (!orderRepository) throw new TypeError('ORDER_REPOSITORY_REQUIRED');
    this.matchingRepository = matchingRepository;
    this.orderRepository = orderRepository;
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

  #resource(order, providerAccountId = order.providerAccountId) {
    return {
      ownerAccountId: order.customerAccountId,
      assignedAccountId: providerAccountId,
      merchantId: order.merchantId,
      serviceId: order.serviceId,
    };
  }

  async #getOrder(orderId) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new Error('ORDER_NOT_FOUND');
    return order;
  }

  async #saveOrderTransition(current, next, actorAccountId, reason) {
    return this.orderRepository.saveWithStatusHistory(next, {
      historyId: this.historyIdGenerator(),
      orderId: current.orderId,
      fromStatus: current.status,
      toStatus: next.status,
      actorAccountId,
      reason,
      createdAt: this.clock(),
    });
  }

  async startMatching(orderId, { actorAccountId = null } = {}) {
    const current = await this.#getOrder(orderId);
    await this.#require(actorAccountId, MatchingPermission.ASSIGN, PermissionAction.ASSIGN, this.#resource(current));
    if (current.status === OrderStatus.SEARCHING) return current;
    if (![OrderStatus.REQUESTED, OrderStatus.RECEIVED].includes(current.status)) throw new Error('MATCHING_ORDER_STATUS_INVALID');
    const next = current.withStatus(OrderStatus.SEARCHING, this.clock());
    return this.#saveOrderTransition(current, next, actorAccountId, 'MATCHING_STARTED');
  }

  async offerProvider(orderId, providerAccountId, { actorAccountId = null, mode = MatchingMode.MANUAL_ADMIN, reason = null } = {}) {
    if (!providerAccountId) throw new TypeError('MATCHING_PROVIDER_ACCOUNT_ID_REQUIRED');
    const current = await this.#getOrder(orderId);
    await this.#require(actorAccountId, MatchingPermission.ASSIGN, PermissionAction.ASSIGN, this.#resource(current));
    if (current.status !== OrderStatus.SEARCHING) throw new Error('MATCHING_ORDER_NOT_SEARCHING');

    const previous = await this.matchingRepository.findLatestByOrderId(orderId);
    const now = this.clock();
    let attemptNo = 1;
    if (previous) {
      attemptNo = previous.attemptNo + 1;
      if (![MatchingStatus.REJECTED, MatchingStatus.REASSIGNED, MatchingStatus.FAILED, MatchingStatus.CANCELLED].includes(previous.status)) {
        await this.matchingRepository.save(previous.withState(MatchingStatus.REASSIGNED, { reason: reason ?? 'REASSIGNED', updatedAt: now }));
      }
    }

    const matching = new Matching({
      matchingId: this.idGenerator(),
      orderId,
      serviceId: current.serviceId,
      providerAccountId,
      mode,
      status: MatchingStatus.OFFERED,
      attemptNo,
      reason,
      matchedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await this.matchingRepository.save(matching);

    const next = new Order({ ...current, providerAccountId, status: OrderStatus.ASSIGNED, updatedAt: now });
    await this.#saveOrderTransition(current, next, actorAccountId, 'PROVIDER_ASSIGNED');
    return matching;
  }

  async accept(matchingId, { actorAccountId } = {}) {
    const matching = await this.matchingRepository.findById(matchingId);
    if (!matching) throw new Error('MATCHING_NOT_FOUND');
    if (matching.status === MatchingStatus.ACCEPTED) return matching;
    if (matching.status !== MatchingStatus.OFFERED) throw new Error('MATCHING_NOT_OFFERED');
    const order = await this.#getOrder(matching.orderId);
    if (order.providerAccountId !== matching.providerAccountId) throw new Error('MATCHING_PROVIDER_MISMATCH');
    await this.#require(actorAccountId, MatchingPermission.RESPOND, PermissionAction.APPROVE, this.#resource(order, matching.providerAccountId));
    if (actorAccountId && actorAccountId !== matching.providerAccountId) throw new Error('MATCHING_RESPONSE_ACTOR_MISMATCH');
    if (order.status !== OrderStatus.ASSIGNED) throw new Error('MATCHING_ORDER_STATUS_INVALID');

    const now = this.clock();
    const accepted = matching.withState(MatchingStatus.ACCEPTED, { respondedAt: now, updatedAt: now });
    await this.matchingRepository.save(accepted);
    const nextOrder = order.withStatus(OrderStatus.ACCEPTED, now);
    await this.#saveOrderTransition(order, nextOrder, actorAccountId, 'PROVIDER_ACCEPTED');
    return accepted;
  }

  async reject(matchingId, { actorAccountId, reason = null } = {}) {
    const matching = await this.matchingRepository.findById(matchingId);
    if (!matching) throw new Error('MATCHING_NOT_FOUND');
    if (matching.status === MatchingStatus.REJECTED) return matching;
    if (matching.status !== MatchingStatus.OFFERED) throw new Error('MATCHING_NOT_OFFERED');
    const order = await this.#getOrder(matching.orderId);
    if (order.providerAccountId !== matching.providerAccountId) throw new Error('MATCHING_PROVIDER_MISMATCH');
    await this.#require(actorAccountId, MatchingPermission.RESPOND, PermissionAction.APPROVE, this.#resource(order, matching.providerAccountId));
    if (actorAccountId && actorAccountId !== matching.providerAccountId) throw new Error('MATCHING_RESPONSE_ACTOR_MISMATCH');
    if (order.status !== OrderStatus.ASSIGNED) throw new Error('MATCHING_ORDER_STATUS_INVALID');

    const now = this.clock();
    const rejected = matching.withState(MatchingStatus.REJECTED, { reason, respondedAt: now, updatedAt: now });
    await this.matchingRepository.save(rejected);
    const nextOrder = new Order({ ...order, providerAccountId: null, status: OrderStatus.SEARCHING, updatedAt: now });
    await this.#saveOrderTransition(order, nextOrder, actorAccountId, 'PROVIDER_REJECTED');
    return rejected;
  }

  async listByOrder(orderId, { actorAccountId = null } = {}) {
    const order = await this.#getOrder(orderId);
    await this.#require(actorAccountId, MatchingPermission.VIEW, PermissionAction.VIEW, this.#resource(order));
    return this.matchingRepository.listByOrderId(orderId);
  }
}
