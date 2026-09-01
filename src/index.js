import { CITIES, isSupportedCity, isSupportedUnitType } from './lib/cities.js';
import { checkRateLimit } from './lib/ratelimit.js';
import { incrementCounter, getCounters } from './lib/usage.js';
import { refreshAllCities } from './refresh.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, url, env);
    }

    // Everything else is the static frontend (public/), served via Workers
    // Static Assets — no separate Pages project needed, one `wrangler deploy`
    // ships the whole app.
    return env.ASSETS.fetch(request);
  },

  // Fires on the Cron Trigger configured in wrangler.toml. This is the ONLY
  // path that ever calls an external API — see src/refresh.js for why that
  // matters for cost safety.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshAllCities(env.DB, env));
  },
};

async function handleApi(request, url, env) {
  // Rate limit every /api/* route on the caller's IP.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rl = await checkRateLimit(env.RATE_LIMIT_KV, ip);
  if (!rl.allowed) {
    return json({ error: 'rate_limited', retryAfterSeconds: rl.retryAfterSeconds }, 429, {
      'Retry-After': String(rl.retryAfterSeconds),
    });
  }

  if (url.pathname === '/api/health') {
    return json({ ok: true, time: new Date().toISOString() });
  }

  if (url.pathname === '/api/cities') {
    const cities = Object.entries(CITIES).map(([slug, c]) => ({
      slug,
      label: c.label,
      center: c.center,
      zoom: c.zoom,
    }));
    return json({ cities });
  }

  if (url.pathname === '/api/stats') {
    const counters = await getCounters(env.DB);
    return json({ counters });
  }

  if (url.pathname === '/api/rents') {
    return handleRents(url, env);
  }

  return json({ error: 'not_found' }, 404);
}

async function handleRents(url, env) {
  const city = url.searchParams.get('city');
  const unit = url.searchParams.get('unit');

  if (!isSupportedCity(city)) {
    return json({ error: 'unknown_city', supported: Object.keys(CITIES) }, 400);
  }
  if (!isSupportedUnitType(unit)) {
    return json({ error: 'unknown_unit_type', supported: ['studio', 'one-bed', 'two-bed'] }, 400);
  }

  // Prefer Census ACS (broader coverage), fall back to HUD FMR per-ZIP where
  // Census has no data for that ZIP/unit-type combo.
  const { results } = await env.DB.prepare(
    `SELECT zip, unit_type, median_rent, lat, lon, source, source_period, updated_at
     FROM rent_observations
     WHERE city = ? AND unit_type = ?
     ORDER BY zip, CASE source WHEN 'census-acs' THEN 0 WHEN 'hud-fmr' THEN 1 ELSE 2 END`
  )
    .bind(city, unit)
    .all();

  const seenZips = new Set();
  const features = [];
  let minRent = Infinity;
  let maxRent = -Infinity;

  for (const row of results ?? []) {
    if (seenZips.has(row.zip)) continue; // first hit per ZIP wins (source priority via ORDER BY)
    seenZips.add(row.zip);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.lon, row.lat] },
      properties: {
        zip: row.zip,
        medianRent: row.median_rent,
        source: row.source,
        sourcePeriod: row.source_period,
        updatedAt: row.updated_at,
      },
    });
    minRent = Math.min(minRent, row.median_rent);
    maxRent = Math.max(maxRent, row.median_rent);
  }

  await incrementCounter(env.DB, 'heatmap_view');

  return json({
    type: 'FeatureCollection',
    features,
    meta: {
      city,
      unitType: unit,
      minRent: Number.isFinite(minRent) ? minRent : null,
      maxRent: Number.isFinite(maxRent) ? maxRent : null,
    },
  });
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
