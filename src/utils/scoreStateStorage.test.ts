import test from 'node:test';
import assert from 'node:assert/strict';
import { collectRecordChanges } from './scoreStateStorage.ts';

test('score-state delta includes changed and new rows without resending unchanged rows', () => {
  const previous = [
    { studentId: 1, subjectId: 2, score: 8, updatedAt: '2026-11-16T10:00:00.000Z' },
    { studentId: 1, subjectId: 3, score: 6, updatedAt: '2026-11-16T10:00:00.000Z' }
  ];
  const current = [
    { studentId: 1, subjectId: 2, score: 9, updatedAt: '2026-11-17T10:00:00.000Z' },
    { studentId: 1, subjectId: 3, score: 6, updatedAt: '2026-11-17T10:00:00.000Z' },
    { studentId: 2, subjectId: 2, score: 7, updatedAt: '2026-11-17T10:00:00.000Z' }
  ];

  const changes = collectRecordChanges(
    'scores',
    previous,
    current,
    score => `${score.studentId}:${score.subjectId}`
  );

  assert.deepEqual(changes.upserts.map(change => change.recordKey), ['1:2', '2:2']);
  assert.deepEqual(changes.deletes, []);
});

test('score-state delta reports removed rows', () => {
  const changes = collectRecordChanges(
    'scores',
    [{ studentId: 1, subjectId: 2, score: 8 }],
    [],
    score => `${score.studentId}:${score.subjectId}`
  );

  assert.deepEqual(changes.upserts, []);
  assert.deepEqual(changes.deletes, [{ recordType: 'scores', recordKey: '1:2' }]);
});
