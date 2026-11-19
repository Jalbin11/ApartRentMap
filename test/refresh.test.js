import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshAllCities } from '../src/refresh.js';
import { CITIES } from '../src/lib/cities.js';

// Minimal in-memory stand-in for the D1 binding: records every bound statement.
function fakeDb() {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind: (...args) => ({ run: async () => { writes.push({ sql, args }); return {}; }, first: async () => null }),
        run: async () => { writes.push({ sql, args: [] }); return {}; },
        first: async () => null,
      };
    },
  };
}

function fakeFetch(calls) {
  return async (url) => {
    calls.push(String(url));
    if (String(url).startsWith('https://api.census.gov/')) {
      const zips = decodeURIComponent(new URL(url).searchParams.get('for')).split(':')[1].split(',');
      return {
        ok: true,
        json: async () => [
          ['NAME', 'B25031_002E', 'B25031_003E', 'B25031_004E', 'zip code tabulation area'],
          ...zips.map((z) => [`ZCTA5 ${z}`, '1000', '1200', '1500', z]),
        ],
      };
    }
    const entity = String(url).split('/').pop();
    const city = Object.values(CITIES).find((c) => c.hudEntityId === entity);
    return {
      ok: true,
      json: async () => ({
        data: {
          area_name: city.label,
          year: '2026',
          basicdata: city.zips.map((z) => ({ zip_code: z.zip, Efficiency: 900, 'One-Bedroom': 1100, 'Two-Bedroom': 1400 })),
        },
      }),
    };
  };
}

test('refresh makes one HUD call per metro (not per ZIP) and stores every ZIP', async () => {
  const db = fakeDb();
  const calls = [];
  const results = await refreshAllCities(db, { HUD_API_TOKEN: 'x' }, { fetchImpl: fakeFetch(calls) });

  const cityCount = Object.keys(CITIES).length;
  const zipCount = Object.values(CITIES).reduce((n, c) => n + c.zips.length, 0);
  const hudCalls = calls.filter((u) => u.includes('huduser.gov'));

  assert.deepEqual(results.errors, []);
  assert.equal(hudCalls.length, cityCount);
  assert.ok(hudCalls.every((u) => /\/fmr\/data\/METRO\w+$/.test(u)), hudCalls.join('\n'));
  assert.equal(results.census, zipCount * 3);
  assert.equal(results.hud, zipCount * 3);

  const hudWrites = db.writes.filter((w) => w.args[6] === 'hud-fmr');
  assert.equal(hudWrites.length, zipCount * 3);
  assert.ok(hudWrites.every((w) => w.args[7] === 'FY2026'));
});

test('refresh skips HUD entirely without a token', async () => {
  const calls = [];
  const results = await refreshAllCities(fakeDb(), {}, { fetchImpl: fakeFetch(calls) });
  assert.equal(results.hud, 0);
  assert.ok(!calls.some((u) => u.includes('huduser.gov')));
});
