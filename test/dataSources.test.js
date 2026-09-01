import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCensusResponse } from '../src/dataSources/census.js';
import { parseHudResponse } from '../src/dataSources/hud.js';

test('parseCensusResponse maps B25031 columns to unit types', () => {
  // Shape matches the Census ACS API's documented response: array-of-arrays,
  // header row first. https://www.census.gov/data/developers/data-sets/acs-5year.html
  const rows = [
    ['NAME', 'B25031_002E', 'B25031_003E', 'B25031_004E', 'zip code tabulation area'],
    ['ZCTA5 78701', '1200', '1450', '1900', '78701'],
    ['ZCTA5 78704', '1100', '1350', '1750', '78704'],
  ];

  const out = parseCensusResponse(rows);

  assert.equal(out.length, 6);
  assert.deepEqual(
    out.filter((r) => r.zip === '78701').sort((a, b) => a.unitType.localeCompare(b.unitType)),
    [
      { zip: '78701', unitType: 'one-bed', medianRent: 1450 },
      { zip: '78701', unitType: 'studio', medianRent: 1200 },
      { zip: '78701', unitType: 'two-bed', medianRent: 1900 },
    ]
  );
});

test('parseCensusResponse drops Census "not available" sentinel values', () => {
  const rows = [
    ['NAME', 'B25031_002E', 'B25031_003E', 'B25031_004E', 'zip code tabulation area'],
    ['ZCTA5 99999', '-666666666', '1450', '-666666666', '99999'],
  ];

  const out = parseCensusResponse(rows);

  assert.equal(out.length, 1);
  assert.equal(out[0].unitType, 'one-bed');
});

test('parseCensusResponse handles empty/malformed input without throwing', () => {
  assert.deepEqual(parseCensusResponse([]), []);
  assert.deepEqual(parseCensusResponse(null), []);
  assert.deepEqual(parseCensusResponse([['NAME']]), []);
});

test('parseHudResponse maps FMR bedroom fields to unit types', () => {
  const body = {
    data: {
      basicdata: [
        { year: '2026', Efficiency: 1150, 'One-Bedroom': 1300, 'Two-Bedroom': 1650, 'Three-Bedroom': 2100 },
      ],
    },
  };

  const out = parseHudResponse('78701', body);

  assert.deepEqual(
    out.sort((a, b) => a.unitType.localeCompare(b.unitType)),
    [
      { zip: '78701', unitType: 'one-bed', medianRent: 1300, period: '2026' },
      { zip: '78701', unitType: 'studio', medianRent: 1150, period: '2026' },
      { zip: '78701', unitType: 'two-bed', medianRent: 1650, period: '2026' },
    ]
  );
});

test('parseHudResponse handles missing/malformed data without throwing', () => {
  assert.deepEqual(parseHudResponse('78701', {}), []);
  assert.deepEqual(parseHudResponse('78701', { data: {} }), []);
  assert.deepEqual(parseHudResponse('78701', null), []);
});
