const { test } = require('node:test');
const assert = require('node:assert/strict');
const Geo = require('../geo.js');

test('specific Menemeni locality wins over a neighbouring city/municipality', () => {
  const resolved = Geo.reverseName({
    locality: 'Μενεμένη',
    city: 'Δήμος Κορδελιού - Ευόσμου',
    principalSubdivision: 'Κεντρική Μακεδονία',
    countryName: 'Ελλάδα',
    countryCode: 'gr',
    lookupSource: 'reverseGeocoding'
  });
  assert.deepEqual(resolved, {
    name: 'Μενεμένη',
    admin1: 'Κεντρική Μακεδονία',
    country: 'Ελλάδα',
    cc: 'GR'
  });
});

test('city is a fallback when no finer locality is available', () => {
  assert.equal(Geo.reverseName({ locality: '', city: 'Θεσσαλονίκη' }).name, 'Θεσσαλονίκη');
  assert.equal(Geo.reverseName({ localityName: 'Menemeni', city: 'Thessaloniki' }).name, 'Menemeni');
  assert.equal(Geo.reverseName(null), null);
  assert.equal(Geo.reverseName({ lookupSource: 'ipGeolocation', city: 'Thessaloniki' }), null);
});

test('GPS rounding retains neighbourhood-level precision and validates coordinates', () => {
  assert.deepEqual(Geo.roundCoordinates(40.65632, 22.90925), { lat: 40.656, lon: 22.909 });
  assert.throws(() => Geo.roundCoordinates(100, 20), RangeError);
  assert.throws(() => Geo.roundCoordinates(NaN, 20), RangeError);
});

test('coarse GPS fixes cannot claim a precise neighbourhood', () => {
  assert.equal(Geo.isApproximateFix(900), true);
  assert.equal(Geo.isApproximateFix(30), false);
});

test('numbered English districts are not presented as precise neighbourhood names', () => {
  const raw = {
    locality: '5th District of Thessaloniki',
    city: 'Thessaloniki',
    principalSubdivision: 'Central Macedonia',
    countryName: 'Greece',
    countryCode: 'GR'
  };
  assert.equal(Geo.reverseName(raw, 'el').name, 'Θεσσαλονίκη');
  assert.equal(Geo.reverseName(raw, 'en').name, 'Thessaloniki');
  assert.equal(Geo.normalizeName('5th District of Thessaloniki', 'el'), 'Θεσσαλονίκη');
  assert.equal(Geo.normalizeName('5th District of Thessaloniki', 'en'), 'Thessaloniki');
  assert.equal(Geo.normalizeName('5th District', 'el'), '');
});

test('a real, named locality wins over an administrative district', () => {
  const r = Geo.reverseName({
    locality: '5th District of Thessaloniki',
    localityName: 'Menemeni',
    city: 'Thessaloniki',
    principalSubdivision: 'Central Macedonia'
  }, 'el');
  assert.equal(r.name, 'Μενεμένη');
});

test('do not invent a neighbourhood from an unusable administrative label', () => {
  assert.equal(Geo.reverseName({ locality: '5th District', city: '' }, 'el'), null);
  assert.equal(Geo.normalizeName('Menemeni', 'el'), 'Μενεμένη');
  assert.equal(Geo.normalizeName('Μενεμένη', 'en'), 'Menemeni');
});
