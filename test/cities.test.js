import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, UNIT_TYPES, isSupportedCity, isSupportedUnitType, allZips } from '../src/lib/cities.js';

test('isSupportedCity / isSupportedUnitType reflect the CITIES config', () => {
  for (const slug of Object.keys(CITIES)) {
    assert.equal(isSupportedCity(slug), true);
  }
  assert.equal(isSupportedCity('nowhere'), false);

  for (const unit of UNIT_TYPES) {
    assert.equal(isSupportedUnitType(unit), true);
  }
  assert.equal(isSupportedUnitType('penthouse'), false);
});

test('every city has at least one ZIP with valid lat/lon', () => {
  for (const [slug, city] of Object.entries(CITIES)) {
    assert.ok(city.zips.length > 0, `${slug} has no ZIPs configured`);
    for (const z of city.zips) {
      assert.match(z.zip, /^\d{5}$/, `${slug} ZIP ${z.zip} is not 5 digits`);
      assert.ok(Number.isFinite(z.lat) && Math.abs(z.lat) <= 90);
      assert.ok(Number.isFinite(z.lon) && Math.abs(z.lon) <= 180);
    }
  }
});

test('allZips flattens every city into a single list with city tags', () => {
  const flat = allZips();
  const expectedCount = Object.values(CITIES).reduce((sum, c) => sum + c.zips.length, 0);
  assert.equal(flat.length, expectedCount);
  assert.ok(flat.every((z) => isSupportedCity(z.city)));
});
