import assert from 'node:assert/strict';
import test from 'node:test';
import { RevisionedValueCache } from './revisionedValueCache.ts';

test('revisioned cache returns only a fresh value for its revision', () => {
  const cache = new RevisionedValueCache<string>(100);
  cache.set('revision-1', 'snapshot', 10);

  assert.equal(cache.get('revision-1', 50), 'snapshot');
  assert.equal(cache.get('revision-2', 50), null);
});

test('revisioned cache expires values and clears them explicitly', () => {
  const cache = new RevisionedValueCache<string>(100);
  cache.set('revision-1', 'snapshot', 10);

  assert.equal(cache.get('revision-1', 110), null);

  cache.set('revision-2', 'new snapshot', 120);
  cache.clear();
  assert.equal(cache.get('revision-2', 121), null);
});
