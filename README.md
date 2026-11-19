# ApartRentMap

An open-source, API-driven apartment rent heatmap. Pick a city and a unit
type, see a live heatmap of median rent by ZIP code — built entirely on free
government data and Cloudflare's free tier, with no path for public traffic
to ever generate a bill.

**Status:** MVP v2 — real API architecture, real (fixture-seeded) demo data.
Live free-data ingestion (Census/HUD) is written but not yet exercised
end-to-end against the real APIs — see [Data sources](#data-sources) below.

## How it works

```
Cron Trigger (daily)                 Visitor request
        │                                    │
        ▼                                    ▼
  refresh Worker  ──writes──▶  D1  ◀──reads── read API Worker ──serves──▶ frontend (heatmap)
        │
        ▼
  Census ACS API / HUD FMR API (free, government)
```

- **`src/refresh.js`** is the *only* code that ever calls an external API. It
  runs on a Cron Trigger (`wrangler.toml`), never from a request a visitor can
  trigger.
- **`src/index.js`** serves `/api/*` (reading only from D1 — never calling out
  externally) and the static frontend (`public/`), all from one Worker.
- **`public/`** is a small vanilla-JS frontend (Leaflet + Leaflet.heat,
  vendored locally — no CDN dependency at runtime) that calls `/api/cities`
  and `/api/rents` and renders the heatmap.

This split is deliberate: **no pay-per-call API is ever reachable from a
public request.** Total external-API exposure is bounded by the cron
schedule, not by how much traffic the site gets — so opening this up publicly
can't turn into a surprise bill.

## Data sources

- **[Census Bureau ACS 5-Year API](https://www.census.gov/data/developers/data-sets/acs-5year.html)**
  — free, live REST API, free self-serve API key. Table `B25031` (median
  gross rent *by bedroom count*) maps directly to our studio/one-bed/two-bed
  filter. Primary source.
- **[HUD Fair Market Rents API](https://www.huduser.gov/portal/dataset/fmr-api.html)**
  — free, live REST API, free token. Optional second source used to fill in
  ZIPs Census suppresses. The refresh job skips HUD entirely if
  `HUD_API_TOKEN` isn't set — Census alone is enough to run.

Both clients (`src/dataSources/census.js`, `src/dataSources/hud.js`) are
written from the documented API contracts and unit-tested against fixture
responses (`test/dataSources.test.js`, `test/refresh.test.js`). They have
**not yet been run against the live endpoints**, because the sandbox that
wrote them can't reach either host. Cloudflare Workers have normal outbound
internet once deployed.

**Check them live in one command** before the first deploy, from any machine
with normal internet (nothing is written anywhere):

```bash
CENSUS_API_KEY=... HUD_API_TOKEN=... npm run verify:sources
```

It runs the exact client code the refresh job uses and prints `OK`/`FAIL` per
city, with sample rows. Both variables are optional: Census works keyless at
low volume, and HUD is reported as `SKIPPED` without a token. With a HUD token
it also checks each city's `hudEntityId` (in `src/lib/cities.js`) against
HUD's own metro list and suggests the right code if one is wrong. Exit code 1
means at least one source returned nothing or errored.

How HUD is queried: its `fmr/data/{id}` endpoint takes a **metro or county
entity ID** (e.g. `METRO12420M12420`), not a ZIP, so the refresh job makes one
call per city and picks our ZIPs out of the metro's Small Area FMR list. A
metro that only publishes metro-wide FMRs is skipped and reported, rather than
painting one number over every ZIP.

## Local development

```bash
npm install
npm run db:migrate:local   # create the local D1 schema
npm run seed:fixture       # seed plausible demo data (labeled source='fixture')
npm run dev                # starts the Worker at http://localhost:8787
```

Open `http://localhost:8787` — you'll see a working heatmap over demo data
without needing any API keys.

Run the unit tests (pure logic — data parsing, rate limiting, city config —
no network or live Cloudflare account needed):

```bash
npm test
```

## Deploying for real

1. `wrangler d1 create apartrentmap-db` and `wrangler kv namespace create RATE_LIMIT_KV`
   — paste the resulting IDs into `wrangler.toml` (currently placeholders).
2. `wrangler d1 execute apartrentmap-db --remote --file=db/schema.sql`
3. Get a free Census API key ([signup](https://api.census.gov/data/key_signup.html))
   and, optionally, a free HUD token
   ([signup](https://www.huduser.gov/hudapi/public/register)):
   ```bash
   wrangler secret put CENSUS_API_KEY
   wrangler secret put HUD_API_TOKEN   # optional
   ```
4. `wrangler deploy`
5. Run `npm run verify:sources` with the same keys (see [Data sources](#data-sources))
   and fix anything it marks `FAIL`.
6. Trigger the first refresh manually (don't wait for the daily cron) via the
   Cloudflare dashboard's "Trigger Cron" button, or `wrangler dev --test-scheduled`
   locally with real keys, so D1 has real data before anyone visits.

**Before making this public:** confirm in the Cloudflare dashboard that
Workers Paid is *not* enabled on this account/project. Everything here is
sized for Workers Free (100k req/day — requests beyond that are rejected, not
billed), D1 free tier, and free Cron Triggers. As long as Workers Paid stays
off and no other paid API gets wired into a public-request path, this cannot
generate a bill regardless of traffic.

## Adding a new metro

Add an entry to `src/lib/cities.js` with the city's ZIPs, approximate
centroids and (optionally) its HUD `hudEntityId` — that's it. The refresh job, API, and frontend all read from that
one config; no other code changes needed. (Current ZIP centroids are
hand-picked approximations, good enough for a heatmap; swapping in Census
Gazetteer ZCTA centroid files — also free — would make them exact.)

## License

[MIT](LICENSE). Leaflet and Leaflet.heat (vendored in `public/vendor/`) are
BSD-licensed.
