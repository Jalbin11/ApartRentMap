// Census Bureau ACS 5-Year API — free, live REST API, free self-serve key.
// https://www.census.gov/data/developers/data-sets/acs-5year.html
//
// Table B25031 = "Median Gross Rent by Bedrooms" (NOT B25064, which is an
// overall median with no bedroom breakdown — B25031 is what actually maps to
// our studio/one-bed/two-bed filter).
//   B25031_002E = studio (no bedroom)
//   B25031_003E = one bedroom
//   B25031_004E = two bedroom
//
// IMPORTANT: this session's sandbox cannot reach api.census.gov (outbound
// network policy blocks arbitrary hosts — confirmed via the agent proxy
// status endpoint, see PR description / commit notes). This client is
// written from the documented API contract but has NOT been exercised
// against the live endpoint from this environment. Cloudflare Workers have
// normal outbound internet once deployed, so verify this end-to-end on
// first real deploy (or by running `node scripts/verify-census.mjs` — see
// scripts/ — from a machine with normal internet access).

const ACS_YEAR = '2022'; // most recent 5-year ACS vintage at time of writing
const VARS = ['B25031_002E', 'B25031_003E', 'B25031_004E'];
const VAR_TO_UNIT_TYPE = {
  B25031_002E: 'studio',
  B25031_003E: 'one-bed',
  B25031_004E: 'two-bed',
};

// Census encodes "not available" as large negative sentinel values.
function isValidValue(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/**
 * Fetch median gross rent by bedroom count for a set of ZCTAs (ZIP codes).
 * @param {string[]} zips
 * @param {{apiKey?: string, fetchImpl?: typeof fetch}} opts
 * @returns {Promise<Array<{zip: string, unitType: string, medianRent: number}>>}
 */
export async function fetchCensusMedianRent(zips, opts = {}) {
  const fetchFn = opts.fetchImpl ?? fetch;
  const zipList = zips.join(',');
  const url = new URL(`https://api.census.gov/data/${ACS_YEAR}/acs/acs5`);
  url.searchParams.set('get', ['NAME', ...VARS].join(','));
  url.searchParams.set('for', `zip code tabulation area:${zipList}`);
  if (opts.apiKey) url.searchParams.set('key', opts.apiKey);

  const res = await fetchFn(url.toString());
  if (!res.ok) {
    throw new Error(`Census ACS API returned ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const rows = await res.json();
  return parseCensusResponse(rows);
}

// Exported separately so it can be unit-tested against a fixture response
// with zero network access.
export function parseCensusResponse(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const header = rows[0];
  const zipCol = header.indexOf('zip code tabulation area');
  const out = [];

  for (const row of rows.slice(1)) {
    const zip = row[zipCol];
    for (const varName of VARS) {
      const colIdx = header.indexOf(varName);
      if (colIdx === -1) continue;
      const raw = row[colIdx];
      if (!isValidValue(raw)) continue;
      out.push({
        zip,
        unitType: VAR_TO_UNIT_TYPE[varName],
        medianRent: Number(raw),
      });
    }
  }
  return out;
}

export const SOURCE_ID = 'census-acs';
export const SOURCE_PERIOD = ACS_YEAR;
