import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCensusResponse } from '../src/dataSources/census.js';
import { parseHudMetroResponse, fetchHudFmrForMetro } from '../src/dataSources/hud.js';

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

// Shape of HUD's `fmr/data/{metro entity id}` response for a Small Area FMR
// metro: `basicdata` is an array, one object per ZIP.
const hudSafmrBody = {
  data: {
    metro_name: 'Austin-Round Rock-San Marcos, TX MSA',
    area_name: 'Austin-Round Rock-San Marcos, TX MSA',
    smallarea_status: '1',
    year: '2026',
    basicdata: [
      { zip_code: '78701', Efficiency: 1650, 'One-Bedroom': 1790, 'Two-Bedroom': 2140, 'Three-Bedroom': 2800 },
      { zip_code: '78702', Efficiency: '1380', 'One-Bedroom': '1500', 'Two-Bedroom': '1800' },
      { zip_code: '78610', Efficiency: 1100, 'One-Bedroom': 1200, 'Two-Bedroom': 1450 },
    ],
  },
};

test('parseHudMetroResponse picks out only the requested ZIPs from a Small Area FMR metro', () => {
  const out = parseHudMetroResponse(hudSafmrBody, ['78701', '78702', '78704']);

  assert.equal(out.smallArea, true);
  assert.equal(out.areaName, 'Austin-Round Rock-San Marcos, TX MSA');
  assert.deepEqual(out.missingZips, ['78704']);
  assert.equal(out.rows.length, 6); // 2 ZIPs x 3 unit types; 78610 not requested
  assert.ok(out.rows.every((r) => r.zip !== '78610'));
  assert.deepEqual(
    out.rows.filter((r) => r.zip === '78702').sort((a, b) => a.unitType.localeCompare(b.unitType)),
    [
      { zip: '78702', unitType: 'one-bed', medianRent: 1500, period: 'FY2026' },
      { zip: '78702', unitType: 'studio', medianRent: 1380, period: 'FY2026' },
      { zip: '78702', unitType: 'two-bed', medianRent: 1800, period: 'FY2026' },
    ]
  );
});

test('parseHudMetroResponse never paints one ZIP\'s rent onto another ZIP', () => {
  // The old per-ZIP parser took basicdata[0] whatever ZIP it was for.
  const out = parseHudMetroResponse(hudSafmrBody, ['78702']);
  assert.ok(out.rows.every((r) => r.zip === '78702'));
  assert.ok(!out.rows.some((r) => r.medianRent === 1650));
});

test('parseHudMetroResponse reports a metro-level-only area as not small-area, with no rows', () => {
  const body = {
    data: {
      area_name: 'Somewhere, TX MSA',
      smallarea_status: '0',
      basicdata: { zip_code: 'MSA level', year: '2026', Efficiency: 900, 'One-Bedroom': 1000, 'Two-Bedroom': 1200 },
    },
  };
  const out = parseHudMetroResponse(body, ['78701']);
  assert.equal(out.smallArea, false);
  assert.deepEqual(out.rows, []);
  assert.deepEqual(out.missingZips, ['78701']);
});

test('parseHudMetroResponse handles missing/malformed data without throwing', () => {
  for (const body of [{}, { data: {} }, null, { data: { basicdata: null } }]) {
    const out = parseHudMetroResponse(body, ['78701']);
    assert.deepEqual(out.rows, []);
    assert.equal(out.smallArea, false);
  }
});

test('fetchHudFmrForMetro calls the metro endpoint (not a ZIP) with a bearer token', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => hudSafmrBody };
  };
  const out = await fetchHudFmrForMetro('METRO12420M12420', ['78701'], { token: 't0k', fetchImpl: fakeFetch });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.huduser.gov/hudapi/public/fmr/data/METRO12420M12420');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer t0k');
  assert.equal(out.rows.length, 3);
});
