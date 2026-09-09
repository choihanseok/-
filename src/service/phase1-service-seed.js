import { Service } from './service.js';
import { ServiceStatus } from './service-status.js';
import { ServiceType, assertServiceType } from './service-type.js';

const BASE_PHASE1 = Object.freeze([
  { serviceCode: 'DRIVING', serviceName: '대리운전', serviceType: ServiceType.MBS },
  { serviceCode: 'QUICK', serviceName: '퀵서비스', serviceType: ServiceType.MBS },
  { serviceCode: 'ERRAND', serviceName: '심부름서비스', serviceType: ServiceType.AGC },
]);

export async function seedPhase1Services({
  serviceRepository,
  flowerServiceType = null,
  idGenerator,
  clock = () => new Date(),
}) {
  if (!serviceRepository) throw new TypeError('SERVICE_REPOSITORY_REQUIRED');
  if (!idGenerator) throw new TypeError('SERVICE_ID_GENERATOR_REQUIRED');
  if (flowerServiceType != null) assertServiceType(flowerServiceType);

  const candidates = [...BASE_PHASE1];
  if (flowerServiceType) {
    candidates.splice(2, 0, {
      serviceCode: 'FLOWER',
      serviceName: '꽃배달',
      serviceType: flowerServiceType,
      configuration: { serviceTypeDecision: 'PROJECT_DEFINED_FOR_TEST', productionStatus: 'NEED_REVIEW' },
    });
  }

  const result = { created: [], preserved: [], skipped: [] };
  if (!flowerServiceType) result.skipped.push({ serviceCode: 'FLOWER', reason: 'SERVICE_TYPE_NEED_REVIEW' });

  for (const candidate of candidates) {
    const existing = await serviceRepository.findByCode(candidate.serviceCode);
    if (existing) {
      result.preserved.push(existing.serviceCode);
      continue;
    }
    const now = clock();
    const service = new Service({
      serviceId: idGenerator(candidate.serviceCode),
      serviceCode: candidate.serviceCode,
      serviceName: candidate.serviceName,
      serviceType: candidate.serviceType,
      status: ServiceStatus.DRAFT,
      configuration: candidate.configuration ?? {},
      createdAt: now,
      updatedAt: now,
    });
    await serviceRepository.save(service);
    result.created.push(service.serviceCode);
  }
  return result;
}
