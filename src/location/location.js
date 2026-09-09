import { assertLocationPurpose, LocationPurpose } from './location-purpose.js';

function assertCoordinate(latitude, longitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new TypeError('LOCATION_LATITUDE_INVALID');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new TypeError('LOCATION_LONGITUDE_INVALID');
}

export class Location {
  constructor({
    locationId,
    purpose = LocationPurpose.CURRENT,
    latitude,
    longitude,
    address = null,
    roadAddress = null,
    label = null,
    ownerAccountId = null,
    serviceId = null,
    referenceType = null,
    referenceId = null,
    sequence = 0,
    metadata = {},
    createdAt = new Date(),
    updatedAt = new Date(),
  }) {
    if (!locationId) throw new TypeError('LOCATION_ID_REQUIRED');
    assertLocationPurpose(purpose);
    assertCoordinate(latitude, longitude);
    if (!Number.isInteger(sequence) || sequence < 0) throw new TypeError('LOCATION_SEQUENCE_INVALID');
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) throw new TypeError('LOCATION_METADATA_INVALID');

    this.locationId = locationId;
    this.purpose = purpose;
    this.latitude = latitude;
    this.longitude = longitude;
    this.address = address;
    this.roadAddress = roadAddress;
    this.label = label;
    this.ownerAccountId = ownerAccountId;
    this.serviceId = serviceId;
    this.referenceType = referenceType;
    this.referenceId = referenceId;
    this.sequence = sequence;
    this.metadata = metadata;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  withPosition({ latitude = this.latitude, longitude = this.longitude, address = this.address, roadAddress = this.roadAddress, updatedAt = new Date() }) {
    return new Location({ ...this, latitude, longitude, address, roadAddress, updatedAt });
  }
}

export function distanceMeters(a, b) {
  assertCoordinate(a.latitude, a.longitude);
  assertCoordinate(b.latitude, b.longitude);
  const toRad = (value) => value * Math.PI / 180;
  const earthRadius = 6371008.8;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
