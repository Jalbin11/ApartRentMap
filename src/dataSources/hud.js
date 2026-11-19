// HUD USER Fair Market Rents (FMR) API — free, live REST API, free token
// (self-serve at https://www.huduser.gov/hudapi/public/register).
// https://www.huduser.gov/portal/dataset/fmr-api.html
//
// Used as a SECOND, cross-referencing source alongside Census ACS (census.js)
// — HUD FMR is rent-specific (vs. ACS's broader housing survey) and can fill
// in ZIPs Census suppresses for small-sample privacy reasons.
//
// How the endpoint actually works (this is what the first version got wrong):
// `GET /fmr/data/{entityid}` takes a COUNTY or METRO entity ID — e.g. a
// 10-digit county code like `4845399999`, or a metro code like
// `METRO12420M12420` — NOT a ZIP code. Calling it with a bare ZIP fails.
//
// For metros where HUD publishes Small Area FMRs (`smallarea_status: "1"`),
// `data.basicdata` is an ARRAY with one object per ZIP, each carrying a
// `zip_code` field. For other metros it is a single metro-wide object
// (`zip_code: "MSA level"`), which carries no per-ZIP information and is
// therefore useless for a ZIP heatmap — we skip it and report why, rather
// than paint the same number over every ZIP.
//
// So: one request per METRO (not per ZIP), then pick out our ZIPs.
//
// This sandbox cannot reach www.huduser.gov, so the response shape here is
// from HUD's published API docs and is unit-tested against fixtures only.
// `npm run verify:sources` (scripts/verify-sources.mjs) checks it against the
// live API from any machine with normal internet and a HUD token.

const UNIT_FIELD_TO_UNIT_TYPE = {
  Efficiency: 'studio',
  'One-Bedroom': 'one-bed',
  'Two-Bedroom': 'two-bed',
};

const HUD_BASE = 'https://www.huduser.gov/hudapi/public/fmr';

/**
 * Fetch Fair Market Rents for one HUD metro area and return rows for the
 * requested ZIPs only.
 * @param {string} entityId  HUD metro/county entity ID, e.g. 'METRO12420M12420'
 * @param {string[]} zips    ZIPs we care about inside that metro
 * @param {{token: string, fetchImpl?: typeof fetch}} opts
 * @returns {Promise<{rows: Array<{zip: string, unitType: string, medianRent: number, period?: string}>, smallArea: boolean, areaName?: string, missingZips: string[]}>}
 */
export async function fetchHudFmrForMetro(entityId, zips, opts) {
  if (!opts?.token) {
    throw new Error('HUD FMR API requires a free bearer token (see huduser.gov/hudapi/public/register)');
  }
  if (!entityId) {
    throw new Error('HUD FMR API needs a metro/county entity ID (set hudEntityId in src/lib/cities.js)');
  }
  const fetchFn = opts.fetchImpl ?? fetch;
  const res = await fetchFn(`${HUD_BASE}/data/${encodeURIComponent(entityId)}`, {
    headers: { Authorization: `Bearer ${opts.token}` },
  });
  if (!res.ok) {
    throw new Error(`HUD FMR API returned ${res.status} for ${entityId}: ${await res.text().catch(() => '')}`);
  }
  const body = await res.json();
  return parseHudMetroResponse(body, zips);
}

/**
 * List HUD's metro areas (cbsa_code + area_name). Used by the verify script
 * to confirm the hudEntityId values in cities.js are real.
 * @param {{token: string, fetchImpl?: typeof fetch}} opts
 */
export async function listHudMetroAreas(opts) {
  const fetchFn = opts.fetchImpl ?? fetch;
  const res = await fetchFn(`${HUD_BASE}/listMetroAreas`, {
    headers: { Authorization: `Bearer ${opts.token}` },
  });
  if (!res.ok) {
    throw new Error(`HUD listMetroAreas returned ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const body = await res.json();
  return Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
}

// Exported separately so it can be unit-tested against a fixture response
// with zero network access.
export function parseHudMetroResponse(body, zips) {
  const data = body?.data;
  const wanted = new Set(zips ?? []);
  const result = { rows: [], smallArea: false, areaName: undefined, missingZips: [...wanted] };
  if (!data || typeof data !== 'object') return result;

  result.areaName = data.area_name || data.metro_name || undefined;
  const basic = data.basicdata;
  const records = Array.isArray(basic) ? basic : basic && typeof basic === 'object' ? [basic] : [];

  // Per-ZIP data exists only when records carry real 5-digit zip_codes.
  const perZip = records.filter((r) => /^\d{5}$/.test(String(r?.zip_code ?? '')));
  result.smallArea = perZip.length > 0;
  if (!result.smallArea) return result;

  const found = new Set();
  for (const record of perZip) {
    const zip = String(record.zip_code);
    if (!wanted.has(zip)) continue;
    const yearRaw = record.year ?? data.year;
    const period = yearRaw ? `FY${String(yearRaw).replace(/^FY/i, '')}` : undefined;
    for (const [field, unitType] of Object.entries(UNIT_FIELD_TO_UNIT_TYPE)) {
      const n = Number(record[field]);
      if (!Number.isFinite(n) || n <= 0) continue;
      result.rows.push({ zip, unitType, medianRent: n, period });
      found.add(zip);
    }
  }
  result.missingZips = [...wanted].filter((z) => !found.has(z));
  return result;
}

export const SOURCE_ID = 'hud-fmr';
