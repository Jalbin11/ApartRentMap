// HUD USER Fair Market Rents (FMR) API — free, live REST API, free token
// (self-serve at https://www.huduser.gov/hudapi/public/register).
// https://www.huduser.gov/portal/dataset/fmr-api.html
//
// Used as a SECOND, cross-referencing source alongside Census ACS (census.js)
// — HUD FMR is rent-specific (vs. ACS's broader housing survey) and can fill
// in ZIPs Census suppresses for small-sample privacy reasons.
//
// Same caveat as census.js: this session's sandbox cannot reach
// www.huduser.gov (outbound network policy blocks it — confirmed via the
// agent proxy status endpoint). Written from the documented API contract,
// NOT exercised against the live endpoint from this environment. Verify on
// first real deploy or with normal internet access before relying on it —
// the exact response shape (field names in particular) should be double
// checked against current HUD API docs, which can drift.

const UNIT_FIELD_TO_UNIT_TYPE = {
  Efficiency: 'studio',
  'One-Bedroom': 'one-bed',
  'Two-Bedroom': 'two-bed',
};

/**
 * Fetch Fair Market Rents for a single ZIP code.
 * @param {string} zip
 * @param {{token: string, fetchImpl?: typeof fetch}} opts
 * @returns {Promise<Array<{zip: string, unitType: string, medianRent: number, period: string}>>}
 */
export async function fetchHudFmrForZip(zip, opts) {
  if (!opts?.token) {
    throw new Error('HUD FMR API requires a free bearer token (see huduser.gov/hudapi/public/register)');
  }
  const fetchFn = opts.fetchImpl ?? fetch;
  const res = await fetchFn(`https://www.huduser.gov/hudapi/public/fmr/data/${zip}`, {
    headers: { Authorization: `Bearer ${opts.token}` },
  });
  if (!res.ok) {
    throw new Error(`HUD FMR API returned ${res.status} for ZIP ${zip}: ${await res.text().catch(() => '')}`);
  }
  const body = await res.json();
  return parseHudResponse(zip, body);
}

// Exported separately so it can be unit-tested against a fixture response
// with zero network access.
export function parseHudResponse(zip, body) {
  const record = body?.data?.basicdata?.[0] ?? body?.data?.basicdata ?? null;
  if (!record) return [];

  const period = record.year ? String(record.year) : undefined;
  const out = [];
  for (const [field, unitType] of Object.entries(UNIT_FIELD_TO_UNIT_TYPE)) {
    const raw = record[field];
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    out.push({ zip, unitType, medianRent: n, period });
  }
  return out;
}

export const SOURCE_ID = 'hud-fmr';
