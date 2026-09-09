export class MapProviderAdapter {
  async geocode(_query) { throw new Error('NOT_IMPLEMENTED'); }
  async reverseGeocode(_coordinate) { throw new Error('NOT_IMPLEMENTED'); }
  async calculateRoute(_input) { throw new Error('NOT_IMPLEMENTED'); }
  async searchNearby(_input) { throw new Error('NOT_IMPLEMENTED'); }
}

export class FakeMapProviderAdapter extends MapProviderAdapter {
  constructor({ geocodeResult = null, reverseGeocodeResult = null, routeResult = null, nearbyResult = [] } = {}) {
    super();
    this.geocodeResult = geocodeResult;
    this.reverseGeocodeResult = reverseGeocodeResult;
    this.routeResult = routeResult;
    this.nearbyResult = nearbyResult;
  }
  async geocode(query) { return typeof this.geocodeResult === 'function' ? this.geocodeResult(query) : this.geocodeResult; }
  async reverseGeocode(coordinate) { return typeof this.reverseGeocodeResult === 'function' ? this.reverseGeocodeResult(coordinate) : this.reverseGeocodeResult; }
  async calculateRoute(input) { return typeof this.routeResult === 'function' ? this.routeResult(input) : this.routeResult; }
  async searchNearby(input) { return typeof this.nearbyResult === 'function' ? this.nearbyResult(input) : this.nearbyResult; }
}
