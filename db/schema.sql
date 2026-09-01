-- ApartRentMap D1 schema.
-- Run locally with: npm run db:migrate:local
-- Run against the real (deployed) DB with: wrangler d1 execute apartrentmap-db --remote --file=db/schema.sql

CREATE TABLE IF NOT EXISTS rent_observations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  city          TEXT NOT NULL,          -- city slug, e.g. 'austin'
  zip           TEXT NOT NULL,
  unit_type     TEXT NOT NULL,          -- 'studio' | 'one-bed' | 'two-bed'
  median_rent   REAL,                   -- USD / month
  lat           REAL NOT NULL,
  lon           REAL NOT NULL,
  source        TEXT NOT NULL,          -- 'census-acs' | 'hud-fmr' | 'fixture'
  source_period TEXT,                   -- e.g. Census vintage '2022' or HUD 'FY2026'
  updated_at    TEXT NOT NULL,          -- ISO timestamp of this refresh
  UNIQUE(city, zip, unit_type, source)  -- lets refresh upsert with INSERT OR REPLACE
);

CREATE INDEX IF NOT EXISTS idx_rent_city_unit ON rent_observations(city, unit_type);
CREATE INDEX IF NOT EXISTS idx_rent_zip ON rent_observations(zip);

-- Free, infra-native success/usage tracking (ALB-115) — no third-party analytics needed.
CREATE TABLE IF NOT EXISTS usage_counters (
  event      TEXT PRIMARY KEY,          -- e.g. 'heatmap_view', 'refresh_run'
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
