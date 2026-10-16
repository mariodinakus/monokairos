/* MONO locality resolver. Display names must not expose geocoder district IDs. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MONOGeo = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const text = v => typeof v === 'string' ? v.trim() : '';
  const folding = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  // Only translate names we can identify unambiguously. A GPS fix is NOT a neighbourhood polygon.
  const aliases = [
    [['thessaloniki','θεσσαλονικη','salonika','saloniki'], 'Θεσσαλονίκη', 'Thessaloniki'],
    [['menemeni','μενεμενη'], 'Μενεμένη', 'Menemeni'],
    [['evosmos','ευοσμος'], 'Εύοσμος', 'Evosmos'],
    [['eleftherio kordelio','kordelio','ελευθεριο κορδελιο','κορδελιο'], 'Ελευθέριο-Κορδελιό', 'Eleftherio-Kordelio'],
    [['ampelokipoi','ambelokipoi','αμπελοκηποι'], 'Αμπελόκηποι', 'Ampelokipoi'],
    [['stavroupoli','σταυρουπολη'], 'Σταυρούπολη', 'Stavroupoli'],
    [['kalamaria','καλαμαρια'], 'Καλαμαριά', 'Kalamaria'],
    [['sikies','sykies','συκιες'], 'Συκιές', 'Sykies'],
    [['neapolis','neapoli','νεαπολη'], 'Νεάπολη', 'Neapoli'],
    [['pylaia','πυλαια'], 'Πυλαία', 'Pylaia']
  ];
  const administrative = /(?:^|\s)(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|[ivx]+)\s+(?:municipal\s+|administrative\s+)?(?:district|ward|borough|community)\b/i;
  const greekDistrict = /(?:\b[α-ωΑ-Ω]['΄]?\s+δημοτικ(?:ό|ο|ή|η)\s+(?:διαμέρισμα|κοινότητα)|\b\d+\s*ο?\s+δημοτικ(?:ό|ο|ή|η)\s+(?:διαμέρισμα|κοινότητα))/i;
  const normalizeName = (raw, lang = 'auto') => {
    let name = text(raw);
    if (!name) return '';
    // A numbered district is an administrative label, not the user's locality.
    if (administrative.test(name) || greekDistrict.test(name)) {
      const parent = name.match(/\b(?:of|in)\s+([^,]+)$/i);
      const part = parent ? text(parent[1]) : '';
      // Only strip to the parent when it is a known, named location.
      name = part && aliases.some(([keys]) => keys.includes(folding(part))) ? part : '';
    }
    if (!name) return '';
    const f = folding(name);
    const known = aliases.find(([keys]) => keys.includes(f));
    if (!known) return name;
    return lang === 'el' ? known[1] : lang === 'en' ? known[2] : name;
  };
  function reverseName(data, lang = 'auto') {
    if (!data || typeof data !== 'object' || data.lookupSource === 'ipGeolocation') return null;
    const choices = [data.locality, data.localityName, data.city];
    const name = choices.map(x => normalizeName(x, lang)).find(Boolean);
    if (!name) return null;
    return { name, admin1: text(data.principalSubdivision),
      country: text(data.countryName), cc: text(data.countryCode).toUpperCase() };
  }
  function roundCoordinates(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new RangeError('Invalid GPS coordinates');
    }
    return { lat: Number(latitude.toFixed(3)), lon: Number(longitude.toFixed(3)) };
  }
  function isApproximateFix(accuracyMetres) {
    return Number.isFinite(accuracyMetres) && accuracyMetres > 500;
  }
  return { reverseName, normalizeName, roundCoordinates, isApproximateFix };
});
