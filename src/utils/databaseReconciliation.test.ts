import test from 'node:test';
import assert from 'node:assert/strict';
import { FullDatabaseSnapshot } from './sqlExportGenerator.ts';
import { reconcileNormalizedStudentData } from './databaseReconciliation.ts';

const createSnapshot = (): FullDatabaseSnapshot => ({
  schoolProfile: { name: 'Test School', reportDate: '', currentSession: '2026/27', currentTerm: 'FIRST' },
  sessions: [],
  terms: [],
  classSections: [],
  teachers: [],
  subjects: [],
  students: [
    { id: 1, admissionNumber: 'OLD-1', fullName: 'Old name', gender: 'MALE', currentSectionId: 1, guardianPhone: '08000000000' },
    { id: 2, admissionNumber: 'STALE-2', fullName: 'Stale student', gender: 'FEMALE', currentSectionId: 1 }
  ],
  assessmentComponents: [],
  enrollments: [
    { id: 10, studentId: 1, sectionId: 1, subjectId: 1, termId: 1, isIncluded: false }
  ],
  scores: [
    { id: 20, enrollmentId: 10, studentId: 1, subjectId: 1, componentId: 1, score: 9, updatedBy: 1, updatedAt: 'old' }
  ],
  termSubjectRecords: [],
  termSummaries: [],
  auditLogs: [],
  commentBank: []
});

test('database reconciliation restores populated rows, removes stale rows, and preserves nullable scores', () => {
  const reconciled = reconcileNormalizedStudentData(createSnapshot(), {
    students: [
      { id: 1, admissionNumber: 'NEW-1', fullName: 'Updated name', gender: 'FEMALE', currentSectionId: 2 }
    ],
    enrollments: [
      { id: 11, studentId: 1, sectionId: 2, subjectId: 3, termId: 1, isIncluded: true }
    ],
    scores: [
      { id: 21, enrollmentId: 11, studentId: 1, subjectId: 3, componentId: 4, score: null, updatedBy: 1, updatedAt: 'new' }
    ]
  });

  assert.deepEqual(reconciled.students.map(student => student.id), [1]);
  assert.equal(reconciled.students[0].fullName, 'Updated name');
  assert.equal(reconciled.students[0].guardianPhone, '08000000000');
  assert.deepEqual(reconciled.enrollments.map(enrollment => enrollment.id), [11]);
  assert.deepEqual(reconciled.scores.map(score => score.id), [21]);
  assert.equal(reconciled.scores[0].score, null);
});

test('database reconciliation retains snapshot data when normalized tables are empty', () => {
  const snapshot = createSnapshot();
  const reconciled = reconcileNormalizedStudentData(snapshot, {
    students: [],
    enrollments: [],
    scores: []
  });

  assert.deepEqual(reconciled.students, snapshot.students);
  assert.deepEqual(reconciled.enrollments, snapshot.enrollments);
  assert.deepEqual(reconciled.scores, snapshot.scores);
});
