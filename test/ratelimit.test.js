import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit } from '../src/lib/ratelimit.js';

// Minimal in-memory fake of the Workers KV interface used by checkRateLimit.
function fakeKv() {
  const store = new Map();
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

test('checkRateLimit allows requests under the window limit', async () => {
  const kv = fakeKv();
  for (let i = 0; i < 10; i++) {
    const result = await checkRateLimit(kv, '1.2.3.4');
    assert.equal(result.allowed, true);
  }
});

test('checkRateLimit blocks once the per-window cap is exceeded', async () => {
  const kv = fakeKv();
  let lastResult;
  for (let i = 0; i < 61; i++) {
    lastResult = await checkRateLimit(kv, '5.6.7.8');
  }
  assert.equal(lastResult.allowed, false);
  assert.equal(typeof lastResult.retryAfterSeconds, 'number');
});

test('checkRateLimit tracks different IPs independently', async () => {
  const kv = fakeKv();
  for (let i = 0; i < 60; i++) {
    await checkRateLimit(kv, '1.1.1.1');
  }
  const blocked = await checkRateLimit(kv, '1.1.1.1');
  const otherIp = await checkRateLimit(kv, '2.2.2.2');

  assert.equal(blocked.allowed, false);
  assert.equal(otherIp.allowed, true);
});
