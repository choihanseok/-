export const MatchingMode = Object.freeze({
  AUTO: 'AUTO',
  MERCHANT: 'MERCHANT',
  MANUAL_ADMIN: 'MANUAL_ADMIN',
  EXTERNAL: 'EXTERNAL',
});

const values = new Set(Object.values(MatchingMode));

export function assertMatchingMode(mode) {
  if (!values.has(mode)) throw new TypeError('MATCHING_MODE_INVALID');
  return mode;
}
