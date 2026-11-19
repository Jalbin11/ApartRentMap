#!/usr/bin/env node
// Live check of the two external data sources against the REAL APIs, using
// the exact client code the refresh Worker runs. Writes nothing anywhere.
//
//   CENSUS_API_KEY=... HUD_API_TOKEN=... npm run verify:sources
//
// Both variables are optional: Census works keyless at low volume, and HUD is
// skipped (reported as SKIPPED, not failed) without a token. Exit code is 1 if
// any source that ran returned zero usable rows or errored, else 0.
//
// Run it once from a machine with normal internet before the first deploy —
// the sandbox that wrote these clients could not reach either API.

import { CITIES } from '../src/lib/cities.js';
import { fetchCensusMedianRent, SOURCE_PERIOD } from '../src/dataSources/census.js';
import { fetchHudFmrForMetro, listHudMetroAreas } from '../src/dataSources/hud.js';

const censusKey = process.env.CENSUS_API_KEY || undefined;
const hudToken = process.env.HUD_API_TOKEN || undefined;
let failed = false;

function line(status, msg) {
  console.log(`${status.padEnd(7)} ${msg}`);
}

console.log(`Census ACS 5-year ${SOURCE_PERIOD} (${censusKey ? 'with key' : 'no key'})`);
for (const [slug, city] of Object.entries(CITIES)) {
  const zips = city.zips.map((z) => z.zip);
  try {
    const rows = await fetchCensusMedianRent(zips, { apiKey: censusKey });
    const gotZips = new Set(rows.map((r) => r.zip));
    const missing = zips.filter((z) => !gotZips.has(z));
    if (rows.length === 0) failed = true;
    line(rows.length ? 'OK' : 'FAIL', `${slug}: ${rows.length} rows across ${gotZips.size}/${zips.length} ZIPs` +
      (missing.length ? ` (suppressed/missing: ${missing.join(', ')})` : ''));
    for (const r of rows.slice(0, 3)) console.log(`          e.g. ${r.zip} ${r.unitType} $${r.medianRent}`);
  } catch (err) {
    failed = true;
    line('FAIL', `${slug}: ${err.message}`);
  }
}

console.log('\nHUD Fair Market Rents');
if (!hudToken) {
  line('SKIPPED', 'HUD_API_TOKEN not set (HUD is optional; the refresh job skips it too)');
} else {
  let metros = [];
  try {
    metros = await listHudMetroAreas({ token: hudToken });
  } catch (err) {
    line('WARN', `could not list HUD metros to check entity IDs: ${err.message}`);
  }
  for (const [slug, city] of Object.entries(CITIES)) {
    if (!city.hudEntityId) {
      line('SKIPPED', `${slug}: no hudEntityId in src/lib/cities.js`);
      continue;
    }
    if (metros.length && !metros.some((m) => m.cbsa_code === city.hudEntityId)) {
      failed = true;
      const guess = metros
        .filter((m) => String(m.area_name ?? '').toLowerCase().includes(city.label.split(',')[0].toLowerCase()))
        .map((m) => `${m.cbsa_code} = ${m.area_name}`);
      line('FAIL', `${slug}: ${city.hudEntityId} is not in HUD's metro list.` +
        (guess.length ? ` Candidates: ${guess.join(' | ')}` : ''));
      continue;
    }
    try {
      const { rows, smallArea, areaName, missingZips } = await fetchHudFmrForMetro(
        city.hudEntityId, city.zips.map((z) => z.zip), { token: hudToken });
      if (!smallArea) {
        failed = true;
        line('FAIL', `${slug}: ${areaName ?? city.hudEntityId} returned metro-level FMRs only (no ZIP-level data)`);
        continue;
      }
      if (rows.length === 0) failed = true;
      line(rows.length ? 'OK' : 'FAIL', `${slug}: ${areaName ?? city.hudEntityId}: ${rows.length} rows` +
        (missingZips.length ? ` (no row for: ${missingZips.join(', ')})` : ''));
      for (const r of rows.slice(0, 3)) console.log(`          e.g. ${r.zip} ${r.unitType} $${r.medianRent} ${r.period ?? ''}`);
    } catch (err) {
      failed = true;
      line('FAIL', `${slug}: ${err.message}`);
    }
  }
}

console.log(failed ? '\nRESULT: FAIL — fix the lines above before deploying.' : '\nRESULT: OK');
process.exit(failed ? 1 : 0);
