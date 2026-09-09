export const LocationPurpose = Object.freeze({
  CURRENT: 'CURRENT',
  ORIGIN: 'ORIGIN',
  DESTINATION: 'DESTINATION',
  WAYPOINT: 'WAYPOINT',
  BUSINESS: 'BUSINESS',
});

const VALUES = new Set(Object.values(LocationPurpose));

export function assertLocationPurpose(value) {
  if (!VALUES.has(value)) throw new TypeError('LOCATION_PURPOSE_INVALID');
  return value;
}
