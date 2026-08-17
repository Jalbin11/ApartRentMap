// The ONLY code in this project that calls an external data source. Runs
// exclusively from the Cron Trigger (see `scheduled` export in src/index.js)
// — never from a public request handler. That split is what makes the
// cost-safety guarantee (ALB-111) structural: a visitor hitting the site a
// million times cannot cause a single extra external API call.

import { CITIES, allZips } from './lib/cities.js';
import { fetchCensusMedianRent, SOURCE_ID as CENSUS_SOURCE, SOURCE_PERIOD as CENSUS_PERIOD } from './dataSources/census.js';
import { fetchHudFmrForZip, SOURCE_ID as HUD_SOURCE } from './dataSources/hud.js';
import { incrementCounter } from './lib/usage.js';

/**
 * @param {D1Database} db
 * @param {{CENSUS_API_KEY?: string, HUD_API_TOKEN?: string}} env
 * @param {{fetchImpl?: typeof fetch}} [opts]
 */
export async function refreshAllCities(db, env, opts = {}) {
  const zipIndex = allZips(); // [{city, zip, lat, lon}, ...]
  const results = { census: 0, hud: 0, errors: [] };
  const now = new Date().toISOString();

  // Census: one batched call per city (it accepts a comma-separated ZIP list).
  for (const [citySlug, city] of Object.entries(CITIES)) {
    const zips = city.zips.map((z) => z.zip);
    try {
      const rows = await fetchCensusMedianRent(zips, {
        apiKey: env.CENSUS_API_KEY,
        fetchImpl: opts.fetchImpl,
      });
      for (const row of rows) {
        const zipMeta = city.zips.find((z) => z.zip === row.zip);
        if (!zipMeta) continue;
        await upsertObservation(db, {
          city: citySlug,
          zip: row.zip,
          unitType: row.unitType,
          medianRent: row.medianRent,
          lat: zipMeta.lat,
          lon: zipMeta.lon,
          source: CENSUS_SOURCE,
          sourcePeriod: CENSUS_PERIOD,
          updatedAt: now,
        });
        results.census += 1;
      }
    } catch (err) {
      results.errors.push({ source: 'census', city: citySlug, message: String(err?.message ?? err) });
    }
  }

  // HUD FMR: optional enrichment, skipped entirely if no token is configured
  // (keeps the refresh job from silently failing on every run for anyone who
  // hasn't set up a HUD account yet — Census alone is enough to run).
  if (env.HUD_API_TOKEN) {
    for (const { city: citySlug, zip, lat, lon } of zipIndex) {
      try {
        const rows = await fetchHudFmrForZip(zip, { token: env.HUD_API_TOKEN, fetchImpl: opts.fetchImpl });
        for (const row of rows) {
          await upsertObservation(db, {
            city: citySlug,
            zip: row.zip,
            unitType: row.unitType,
            medianRent: row.medianRent,
            lat,
            lon,
            source: HUD_SOURCE,
            sourcePeriod: row.period,
            updatedAt: now,
          });
          results.hud += 1;
        }
      } catch (err) {
        results.errors.push({ source: 'hud', city: citySlug, zip, message: String(err?.message ?? err) });
      }
    }
  }

  await incrementCounter(db, 'refresh_run');
  return results;
}

async function upsertObservation(db, obs) {
  await db
    .prepare(
      `INSERT OR REPLACE INTO rent_observations
         (city, zip, unit_type, median_rent, lat, lon, source, source_period, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(obs.city, obs.zip, obs.unitType, obs.medianRent, obs.lat, obs.lon, obs.source, obs.sourcePeriod ?? null, obs.updatedAt)
    .run();
}
