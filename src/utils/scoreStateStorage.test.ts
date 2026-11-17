import test from 'node:test';
import assert from 'node:assert/strict';
import type { AssessmentScore, StudentTermSummary } from '../types/index';
import type { FullDatabaseSnapshot } from './sqlExportGenerator.ts';
import {
  collectRecordChanges,
  collectScoreStateChanges,
  isStateRevisionConflictResponse,
  rebaseScoreStateChanges
} from './scoreStateStorage.ts';

function makeSnapshot(
  scores: AssessmentScore[] = [],
  termSummaries: StudentTermSummary[] = []
): FullDatabaseSnapshot {
  return {
    schoolProfile: {
      name: 'Test School',
      reportDate: '',
      currentSession: '2026/27',
      currentTerm: 'FIRST'
    },
    sessions: [],
    terms: [],
    classSections: [],
    teachers: [],
    subjects: [],
    students: [],
    assessmentComponents: [],
    enrollments: [],
    scores,
    termSubjectRecords: [],
    termSummaries,
    auditLogs: [],
    commentBank: []
  };
}

function score(id: number, studentId: number, value: number): AssessmentScore {
  return {
    id,
    enrollmentId: id,
    studentId,
    subjectId: 1,
    componentId: 1,
    score: value,
    updatedBy: 1,
    updatedAt: '2026-11-17T10:00:00.000Z'
  };
}

function summary(totalScoreObtained: number): StudentTermSummary {
  return {
    id: 1,
    studentId: 1,
    sectionId: 1,
    termId: 1,
    totalScoreObtained,
    totalPossibleScore: 100,
    cumulativePercentage: totalScoreObtained,
    cumulativeGrade: 'B',
    classRank: 1,
    totalStudentsInSection: 1,
    principalRemark: '',
    teacherRemark: '',
    isPublished: true,
    updatedAt: '2026-11-17T10:00:00.000Z'
  };
}

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

test('revision conflicts are detected from HTTP status, SQLSTATE, or error text', () => {
  assert.equal(isStateRevisionConflictResponse(409, { error: 'Conflict' }), true);
  assert.equal(isStateRevisionConflictResponse(500, { code: '40001' }), true);
  assert.equal(
    isStateRevisionConflictResponse(503, {
      error: 'Application state changed since it was loaded'
    }),
    true
  );
  assert.equal(isStateRevisionConflictResponse(500, { error: 'Supabase is unavailable' }), false);
});

test('score-state rebasing preserves concurrent edits to different score records', () => {
  const base = makeSnapshot([score(1, 1, 5), score(2, 2, 6)]);
  const submitted = makeSnapshot([score(1, 1, 5), score(2, 2, 8)]);
  const latest = makeSnapshot([score(1, 1, 7), score(2, 2, 6)]);

  const rebased = rebaseScoreStateChanges(
    base,
    latest,
    submitted,
    collectScoreStateChanges(base, submitted)
  );

  assert.deepEqual(
    rebased?.scores.map(record => [record.studentId, record.score]),
    [[1, 7], [2, 8]]
  );
});

test('score-state rebasing rejects concurrent edits to the same score or derived summary', () => {
  const base = makeSnapshot([score(1, 1, 5)], [summary(50)]);
  const concurrentScoreChange = makeSnapshot([score(1, 1, 7)], [summary(50)]);
  const submittedScoreChange = makeSnapshot([score(1, 1, 8)], [summary(50)]);
  const scoreConflict = rebaseScoreStateChanges(
    base,
    concurrentScoreChange,
    submittedScoreChange,
    collectScoreStateChanges(base, submittedScoreChange)
  );

  const concurrentSummaryChange = makeSnapshot([score(1, 1, 5)], [summary(55)]);
  const submittedSummaryChange = makeSnapshot([score(1, 1, 5)], [summary(60)]);
  const summaryConflict = rebaseScoreStateChanges(
    base,
    concurrentSummaryChange,
    submittedSummaryChange,
    collectScoreStateChanges(base, submittedSummaryChange)
  );

  assert.equal(scoreConflict, null);
  assert.equal(summaryConflict, null);
});
