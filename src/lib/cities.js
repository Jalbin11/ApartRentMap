// Supported metros for v1. Each ZIP's [lat, lon] is an approximate centroid,
// enough for a heatmap MVP. For a more accurate future pass, swap these for
// Census Gazetteer ZCTA centroid files (also free) instead of hand-picked values.
//
// Adding a new metro: add a new entry here — everything else (refresh worker,
// API, frontend) reads from this config, no other code changes needed. That's
// what "open source, self-hostable against a different metro" means in practice.

export const CITIES = {
  austin: {
    label: 'Austin, TX',
    center: [30.2672, -97.7431],
    zoom: 11,
    zips: [
      { zip: '78701', lat: 30.2711, lon: -97.7437 },
      { zip: '78702', lat: 30.2626, lon: -97.7181 },
      { zip: '78704', lat: 30.2400, lon: -97.7700 },
      { zip: '78745', lat: 30.2085, lon: -97.8100 },
      { zip: '78748', lat: 30.1734, lon: -97.8130 },
      { zip: '78753', lat: 30.3583, lon: -97.6858 },
    ],
  },
  houston: {
    label: 'Houston, TX',
    center: [29.7604, -95.3698],
    zoom: 10,
    zips: [
      { zip: '77002', lat: 29.7589, lon: -95.3677 },
      { zip: '77006', lat: 29.7385, lon: -95.3910 },
      { zip: '77007', lat: 29.7699, lon: -95.4046 },
      { zip: '77019', lat: 29.7527, lon: -95.4090 },
      { zip: '77030', lat: 29.7079, lon: -95.4009 },
      { zip: '77056', lat: 29.7513, lon: -95.4676 },
    ],
  },
  dallas: {
    label: 'Dallas, TX',
    center: [32.7767, -96.7970],
    zoom: 11,
    zips: [
      { zip: '75201', lat: 32.7873, lon: -96.7987 },
      { zip: '75204', lat: 32.8038, lon: -96.7967 },
      { zip: '75206', lat: 32.8175, lon: -96.7736 },
      { zip: '75214', lat: 32.8237, lon: -96.7627 },
      { zip: '75219', lat: 32.8081, lon: -96.8125 },
      { zip: '75230', lat: 32.8895, lon: -96.7797 },
    ],
  },
};

export const UNIT_TYPES = ['studio', 'one-bed', 'two-bed'];

export function isSupportedCity(slug) {
  return Object.prototype.hasOwnProperty.call(CITIES, slug);
}

export function isSupportedUnitType(unit) {
  return UNIT_TYPES.includes(unit);
}

export function allZips() {
  return Object.entries(CITIES).flatMap(([citySlug, city]) =>
    city.zips.map((z) => ({ city: citySlug, ...z }))
  );
}
