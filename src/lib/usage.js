// Free, infra-native success/usage tracking (ALB-115) — a D1 counter table
// instead of a paid analytics product. Pairs with Cloudflare Web Analytics
// (free, cookie-less, added as a script tag in public/index.html) for
// pageviews; this covers meaningful in-app events.

/**
 * @param {D1Database} db
 * @param {string} event
 */
export async function incrementCounter(db, event) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO usage_counters (event, count, updated_at) VALUES (?, 1, ?)
       ON CONFLICT(event) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
    )
    .bind(event, now)
    .run();
}

/**
 * @param {D1Database} db
 */
export async function getCounters(db) {
  const { results } = await db.prepare('SELECT event, count, updated_at FROM usage_counters').all();
  return results ?? [];
}
