/* MONO local-place resolver. Locality/suburb takes precedence over broad city/municipality labels. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MONOGeo = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const text = v => typeof v === 'string' ? v.trim() : '';
  function reverseName(data) {
    if (!data || typeof data !== 'object' || data.lookupSource === 'ipGeolocation') return null;
    // BigDataCloud "city" can be a broad municipality; "locality" is the suburb/neighbourhood.
    const name = text(data.locality) || text(data.localityName) || text(data.city) || text(data.principalSubdivision);
    if (!name) return null;
    return {
      name,
      admin1: text(data.principalSubdivision),
      country: text(data.countryName),
      cc: text(data.countryCode).toUpperCase()
    };
  }
  function roundCoordinates(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new RangeError('Invalid GPS coordinates');
    }
    // Three decimals: ~111 m in latitude; ~84 m in longitude near Thessaloniki.
    return { lat: Number(latitude.toFixed(3)), lon: Number(longitude.toFixed(3)) };
  }
  function isApproximateFix(accuracyMetres) {
    return Number.isFinite(accuracyMetres) && accuracyMetres > 500;
  }
  return { reverseName, roundCoordinates, isApproximateFix };
});
