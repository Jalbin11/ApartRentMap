// Simple fixed-window rate limit backed by Workers KV (free tier). This isn't
// about cost — reads are already free/capped, not billed — it's about
// keeping the site usable for real visitors if a bot/scraper starts hammering
// the public read API (ALB-113).

const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 60; // ~1 req/sec sustained per IP

/**
 * @param {KVNamespace} kv
 * @param {string} ip
 * @returns {Promise<{allowed: boolean, retryAfterSeconds?: number}>}
 */
export async function checkRateLimit(kv, ip) {
  const windowId = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const key = `ratelimit:${ip}:${windowId}`;
  const current = Number((await kv.get(key)) ?? '0');

  if (current >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: WINDOW_SECONDS };
  }

  await kv.put(key, String(current + 1), { expirationTtl: WINDOW_SECONDS * 2 });
  return { allowed: true };
}
