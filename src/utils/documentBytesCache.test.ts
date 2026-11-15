import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentBytesCache } from './documentBytesCache.ts';

test('document byte cache returns fresh bytes and reports avoided storage reads', () => {
  const cache = new DocumentBytesCache({ maxBytes: 16, maxEntryBytes: 8, ttlMs: 100 });
  const bytes = Uint8Array.from([1, 2, 3]);
  cache.set('document-a', bytes, 10);
  bytes[0] = 9;

  assert.deepEqual(cache.get('document-a', 50), Uint8Array.from([1, 2, 3]));
  assert.deepEqual(cache.getStats(50), {
    entries: 1,
    cachedBytes: 3,
    hits: 1,
    misses: 0,
    bytesServedFromCache: 3
  });
});

test('document byte cache expires entries and invalidates replaced objects', () => {
  const cache = new DocumentBytesCache({ maxBytes: 16, maxEntryBytes: 8, ttlMs: 100 });
  cache.set('document-a', Uint8Array.from([1]), 10);

  assert.equal(cache.get('document-a', 110), null);
  cache.set('document-a', Uint8Array.from([2]), 120);
  cache.delete('document-a');
  assert.equal(cache.get('document-a', 121), null);

  cache.set('document-b', Uint8Array.from([3]), 10);
  assert.deepEqual(cache.getStats(110), {
    entries: 0,
    cachedBytes: 0,
    hits: 0,
    misses: 2,
    bytesServedFromCache: 0
  });
});

test('document byte cache enforces its entry and total byte limits with LRU eviction', () => {
  const cache = new DocumentBytesCache({ maxBytes: 6, maxEntryBytes: 4, ttlMs: 100 });
  cache.set('document-large', new Uint8Array(5), 10);
  assert.equal(cache.getStats(10).entries, 0);

  cache.set('document-a', new Uint8Array(3), 10);
  cache.set('document-b', new Uint8Array(3), 10);
  assert.notEqual(cache.get('document-a', 20), null);
  cache.set('document-c', new Uint8Array(3), 20);

  assert.equal(cache.get('document-b', 30), null);
  assert.notEqual(cache.get('document-a', 30), null);
  assert.equal(cache.getStats(30).cachedBytes, 6);
});
