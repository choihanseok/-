export const ServiceType = Object.freeze({
  MBS: 'MBS',
  EST: 'EST',
  RNT: 'RNT',
  BUY: 'BUY',
  AUC: 'AUC',
  MTC: 'MTC',
  INF: 'INF',
  AGC: 'AGC',
});

const VALUES = new Set(Object.values(ServiceType));

export function assertServiceType(serviceType) {
  if (!VALUES.has(serviceType)) throw new TypeError('SERVICE_TYPE_INVALID');
  return serviceType;
}
