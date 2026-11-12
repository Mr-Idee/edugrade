import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPendingOfflineSnapshot,
  fetchOfflineCommitWithRetry,
  mergePendingOfflineSnapshot,
  omitActiveSessionArchive,
  readJsonResponse,
  shouldQueueOfflineChanges
} from './offlineSyncEngine.ts';

test('offline snapshot merge keeps independent server and local record updates', () => {
  const base = {
    scores: [{ id: 1, score: 12, updatedAt: '2026-11-04T08:00:00.000Z' }],
    students: [{ id: 2, fullName: 'Student A' }]
  };
  const local = {
    scores: [{ id: 1, score: 18, updatedAt: '2026-11-04T08:30:00.000Z' }],
    students: [{ id: 2, fullName: 'Student A' }]
  };
  const queue = createPendingOfflineSnapshot(base, local, '2026-11-04T08:00:00.000Z', '2026-11-04T08:30:00.000Z');
  const server = {
    scores: base.scores,
    students: [{ id: 2, fullName: 'Student B' }]
  };

  const result = mergePendingOfflineSnapshot(server, queue, '2026-11-04T08:25:00.000Z');
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.snapshot?.scores[0].score, 18);
  assert.equal(result.snapshot?.students[0].fullName, 'Student B');
});

test('offline snapshot merge selects the newer timestamp on a score conflict', () => {
  const base = { scores: [{ id: 1, score: 12 }] };
  const local = { scores: [{ id: 1, score: 18 }] };
  const queue = createPendingOfflineSnapshot(base, local, '2026-11-04T08:00:00.000Z', '2026-11-04T08:30:00.000Z');
  const server = { scores: [{ id: 1, score: 15 }] };

  const serverWins = mergePendingOfflineSnapshot(server, queue, '2026-11-04T08:40:00.000Z');
  assert.deepEqual(serverWins.conflicts, []);
  assert.equal(serverWins.snapshot?.scores[0].score, 15);

  const localWins = mergePendingOfflineSnapshot(server, queue, '2026-11-04T08:20:00.000Z');
  assert.deepEqual(localWins.conflicts, []);
  assert.equal(localWins.snapshot?.scores[0].score, 18);
});

test('offline snapshot merge reports unresolved conflicts and accepts an explicit resolution', () => {
  const base = { schoolProfile: { name: 'School A' } };
  const local = { schoolProfile: { name: 'School B' } };
  const queue = createPendingOfflineSnapshot(base, local, '2026-11-04T08:00:00.000Z', '2026-11-04T08:30:00.000Z');
  const server = { schoolProfile: { name: 'School C' } };

  const unresolved = mergePendingOfflineSnapshot(server, queue, '2026-11-04T08:40:00.000Z');
  assert.equal(unresolved.snapshot, null);
  assert.equal(unresolved.conflicts.length, 1);
  assert.equal(unresolved.conflicts[0].key, 'schoolProfile');

  const resolved = mergePendingOfflineSnapshot(server, queue, '2026-11-04T08:40:00.000Z', {
    schoolProfile: 'LOCAL'
  });

  assert.equal(resolved.conflicts.length, 0);
  assert.deepEqual(resolved.snapshot?.schoolProfile, { name: 'School B' });
});

test('only offline and transient availability failures create an offline queue', () => {
  assert.equal(shouldQueueOfflineChanges(false, 500), true);
  assert.equal(shouldQueueOfflineChanges(true, 503), true);
  assert.equal(shouldQueueOfflineChanges(true, 409), false);
  assert.equal(shouldQueueOfflineChanges(true, 500), false);
  assert.equal(shouldQueueOfflineChanges(true, null, new TypeError('Failed to fetch')), true);
  assert.equal(shouldQueueOfflineChanges(true, null, new Error('Invalid snapshot')), false);
});

test('active session archives are omitted from persisted snapshots', () => {
  const historicalArchive = { sessionId: 1 };
  const activeArchive = { sessionId: 2 };
  const snapshot = {
    sessions: [
      { id: 1, isCurrent: false },
      { id: 2, isCurrent: true }
    ],
    sessionArchives: [historicalArchive, activeArchive]
  };

  const persisted = omitActiveSessionArchive(snapshot);
  assert.deepEqual(persisted.sessionArchives, [historicalArchive]);
  assert.deepEqual(snapshot.sessionArchives, [historicalArchive, activeArchive]);
  assert.equal(omitActiveSessionArchive(persisted), persisted);
});

test('offline API responses report a useful error when the server returns HTML instead of JSON', async () => {
  const response = new Response('<!doctype html><title>Not found</title>', {
    status: 404,
    headers: { 'content-type': 'text/html' }
  });
  await assert.rejects(readJsonResponse(response), /non-JSON response \(HTTP 404, text\/html\)/);
});

test('offline API response parser accepts structured JSON error responses', async () => {
  const response = new Response(JSON.stringify({ ok: false, error: 'Conflict' }), {
    status: 409,
    headers: { 'content-type': 'application/json' }
  });
  assert.deepEqual(await readJsonResponse(response), { ok: false, error: 'Conflict' });
});

test('offline commit retries transient network and server failures with the same request', async () => {
  let attempts = 0;
  const response = await fetchOfflineCommitWithRetry(
    '/api/state/offline-commit',
    { method: 'POST', body: 'same-idempotent-payload' },
    async (_url, init) => {
      attempts += 1;
      assert.equal(init?.body, 'same-idempotent-payload');
      if (attempts === 1) throw new TypeError('Connection dropped');
      if (attempts === 2) return new Response('temporarily unavailable', { status: 503 });
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  );
  assert.equal(response.status, 200);
  assert.equal(attempts, 3);
});
