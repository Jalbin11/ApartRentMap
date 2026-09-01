// Seeds the local D1 database with plausible sample rent data so `npm run dev`
// gives you a fully working demo without needing live Census/HUD API access.
// This is clearly-labeled DEMO data (source = 'fixture'), not real rent data —
// swap it for the real thing by running the refresh job (src/refresh.js),
// either locally with real API keys or once deployed via the Cron Trigger.
//
// Usage: npm run seed:fixture

import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CITIES } from '../src/lib/cities.js';

const BASE_RENT = { studio: 1150, 'one-bed': 1400, 'two-bed': 1800 };

// Deterministic pseudo-variance per ZIP so different ZIPs render different
// heat intensity, without needing a random-number seed to persist anywhere.
function zipVariance(zip) {
  const digitSum = String(zip)
    .split('')
    .reduce((sum, d) => sum + Number(d), 0);
  return ((digitSum % 10) - 4.5) * 60; // roughly -270 to +270
}

const now = new Date().toISOString();
const rows = [];

for (const [citySlug, city] of Object.entries(CITIES)) {
  for (const { zip, lat, lon } of city.zips) {
    for (const [unitType, base] of Object.entries(BASE_RENT)) {
      const rent = Math.round(base + zipVariance(zip));
      rows.push(
        `INSERT OR REPLACE INTO rent_observations (city, zip, unit_type, median_rent, lat, lon, source, source_period, updated_at) VALUES ('${citySlug}', '${zip}', '${unitType}', ${rent}, ${lat}, ${lon}, 'fixture', 'demo', '${now}');`
      );
    }
  }
}

const dir = mkdtempSync(path.join(tmpdir(), 'apartrentmap-seed-'));
const sqlPath = path.join(dir, 'seed.sql');
writeFileSync(sqlPath, rows.join('\n') + '\n');

console.log(`Seeding ${rows.length} fixture rent observations into local D1...`);
execFileSync('npx', ['wrangler', 'd1', 'execute', 'apartrentmap-db', '--local', '--file', sqlPath], {
  stdio: 'inherit',
  cwd: path.resolve(new URL('.', import.meta.url).pathname, '..'),
});
console.log('Done. Run `npm run dev` and open the printed URL.');
